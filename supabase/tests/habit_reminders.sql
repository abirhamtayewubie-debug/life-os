-- Habit times and reminders: ownership, one live reminder per habit, repeat
-- rule required, cascade on habit delete. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'alice7@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b7', 'bob7@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);

insert into public.habits (id, user_id, name, scheduled_time) values
  ('47000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'Read', '21:30');
insert into public.reminders (user_id, habit_id, title, remind_at, recurrence_rule, channels) values
  ('00000000-0000-0000-0000-0000000000a7', '47000000-0000-0000-0000-000000000001', 'Read', now() + interval '1 hour', 'FREQ=DAILY', array['in_app', 'web_push']::public.notification_channel[]);

do $$ begin
  -- A second live reminder for the same habit is refused.
  begin
    insert into public.reminders (user_id, habit_id, title, remind_at, recurrence_rule) values
      ('00000000-0000-0000-0000-0000000000a7', '47000000-0000-0000-0000-000000000001', 'Read again', now(), 'FREQ=DAILY');
    raise exception 'FAIL: two live reminders for one habit';
  exception when unique_violation then null;
  end;
  -- A habit reminder must repeat.
  begin
    insert into public.reminders (user_id, habit_id, title, remind_at, status) values
      ('00000000-0000-0000-0000-0000000000a7', '47000000-0000-0000-0000-000000000001', 'Once', now(), 'cancelled');
    raise exception 'FAIL: one-off habit reminder accepted';
  exception when check_violation then null;
  end;
end $$;

-- A cancelled reminder doesn't block a new one.
update public.reminders set status = 'cancelled' where habit_id = '47000000-0000-0000-0000-000000000001';
insert into public.reminders (user_id, habit_id, title, remind_at, recurrence_rule) values
  ('00000000-0000-0000-0000-0000000000a7', '47000000-0000-0000-0000-000000000001', 'Read', now(), 'FREQ=WEEKLY;BYDAY=MO,WE');

-- Bob can't see or attach to Alice's habit.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.reminders) <> 0 then raise exception 'FAIL: Bob sees habit reminders'; end if;
  begin
    insert into public.reminders (user_id, habit_id, title, remind_at, recurrence_rule) values
      ('00000000-0000-0000-0000-0000000000b7', '47000000-0000-0000-0000-000000000001', 'Hijack', now(), 'FREQ=DAILY');
    raise exception 'FAIL: Bob attached a reminder to Alice''s habit';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Deleting the habit removes its reminders.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);
delete from public.habits where id = '47000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.reminders where habit_id is not null) <> 0 then raise exception 'FAIL: habit reminders survived the habit'; end if;
end $$;

reset role;
select 'Habit reminder database tests passed' as result;
rollback;
