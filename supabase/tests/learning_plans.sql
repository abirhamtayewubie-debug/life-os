-- Learning roadmaps, steps, study sessions and study reminders: ownership,
-- checks, and what survives a delete. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a9', 'alice9@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b9', 'bob9@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);

insert into public.skills (id, user_id, name) values ('49000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a9', 'Spanish');
insert into public.learning_items (id, user_id, kind, title) values ('49000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a9', 'course', 'Spanish A1');
insert into public.learning_roadmaps (id, user_id, title, skill_id, study_days, study_time, study_minutes) values
  ('49000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a9', 'Spanish to A2', '49000000-0000-0000-0000-000000000001', '{1,3,5}', '19:00', 30);
insert into public.learning_steps (id, user_id, roadmap_id, position, title, learning_item_id) values
  ('49000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a9', '49000000-0000-0000-0000-000000000003', 1, 'Finish A1 course', '49000000-0000-0000-0000-000000000002');
insert into public.learning_steps (user_id, roadmap_id, position, title, is_exercise) values
  ('00000000-0000-0000-0000-0000000000a9', '49000000-0000-0000-0000-000000000003', 2, '10 minutes of speaking', true);
insert into public.study_sessions (user_id, studied_on, minutes, roadmap_id, learning_item_id, step_id) values
  ('00000000-0000-0000-0000-0000000000a9', current_date, 30, '49000000-0000-0000-0000-000000000003', '49000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000004');
insert into public.reminders (user_id, roadmap_id, title, remind_at, recurrence_rule, channels) values
  ('00000000-0000-0000-0000-0000000000a9', '49000000-0000-0000-0000-000000000003', 'Study: Spanish to A2', now() + interval '1 hour', 'FREQ=WEEKLY;BYDAY=MO,WE,FR', array['in_app', 'web_push']::public.notification_channel[]);

do $$ begin
  begin
    update public.learning_roadmaps set study_days = '{7}' where id = '49000000-0000-0000-0000-000000000003';
    raise exception 'FAIL: day 7 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reminders (user_id, roadmap_id, title, remind_at, recurrence_rule) values
      ('00000000-0000-0000-0000-0000000000a9', '49000000-0000-0000-0000-000000000003', 'Again', now(), 'FREQ=DAILY');
    raise exception 'FAIL: two live reminders for one roadmap';
  exception when unique_violation then null;
  end;
  begin
    insert into public.reminders (user_id, roadmap_id, title, remind_at, status) values
      ('00000000-0000-0000-0000-0000000000a9', '49000000-0000-0000-0000-000000000003', 'Once', now(), 'cancelled');
    raise exception 'FAIL: one-off roadmap reminder accepted';
  exception when check_violation then null;
  end;
end $$;

-- Bob can't see or link to any of it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b9","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.learning_roadmaps) + (select count(*) from public.learning_steps) + (select count(*) from public.study_sessions) <> 0 then
    raise exception 'FAIL: Bob sees Alice''s learning plans';
  end if;
  begin
    insert into public.learning_steps (user_id, roadmap_id, position, title) values
      ('00000000-0000-0000-0000-0000000000b9', '49000000-0000-0000-0000-000000000003', 9, 'Hijack');
    raise exception 'FAIL: Bob added a step to Alice''s roadmap';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.study_sessions (user_id, studied_on, minutes, learning_item_id) values
      ('00000000-0000-0000-0000-0000000000b9', current_date, 10, '49000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: Bob logged a session on Alice''s course';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.learning_roadmaps (user_id, title, skill_id) values
      ('00000000-0000-0000-0000-0000000000b9', 'Hijack', '49000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: Bob linked Alice''s skill';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Deleting the course unlinks it; deleting the roadmap removes its steps and
-- reminder but keeps the study history.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}', true);
delete from public.learning_items where id = '49000000-0000-0000-0000-000000000002';
do $$ begin
  if (select learning_item_id from public.learning_steps where id = '49000000-0000-0000-0000-000000000004') is not null then raise exception 'FAIL: step still linked to deleted course'; end if;
end $$;
delete from public.learning_roadmaps where id = '49000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from public.learning_steps) <> 0 then raise exception 'FAIL: steps survived the roadmap'; end if;
  if (select count(*) from public.reminders where roadmap_id is not null) <> 0 then raise exception 'FAIL: reminder survived the roadmap'; end if;
  if (select count(*) from public.study_sessions where minutes = 30 and roadmap_id is null and step_id is null) <> 1 then raise exception 'FAIL: study history lost'; end if;
end $$;

reset role;
select 'Learning plan database tests passed' as result;
rollback;
