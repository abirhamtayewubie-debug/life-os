-- Phase 2 database rules: isolation of new tables, cycle guards, recurring
-- series and reminder idempotency. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice2@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob2@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

insert into public.tasks (id, user_id, title) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'A'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'B'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a1', 'C');
insert into public.saved_views (user_id, module_key, name, filters) values
  ('00000000-0000-0000-0000-0000000000a1', 'tasks', 'Client work', '{"view":"all","area":"work"}');
insert into public.habits (id, user_id, name) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Read');
insert into public.calendar_events (user_id, title, starts_at, ends_at, recurrence_rule) values
  ('00000000-0000-0000-0000-0000000000a1', 'Standup', now(), now() + interval '15 minutes', 'FREQ=WEEKLY;BYDAY=MO,WE');

-- Dependency chain A → B → C; closing the loop C → A is refused.
insert into public.task_dependencies (user_id, task_id, depends_on_task_id) values
  ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003');
do $$ begin
  begin
    insert into public.task_dependencies (user_id, task_id, depends_on_task_id) values
      ('00000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: dependency cycle accepted';
  exception when check_violation then null;
  end;
end $$;

-- Subtasks: B under A, then A under B is refused.
update public.tasks set parent_task_id = '30000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update public.tasks set parent_task_id = '30000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: subtask cycle accepted';
  exception when check_violation then null;
  end;
end $$;

-- Repeat rules: malformed rules and undated repeats are refused.
do $$ begin
  begin
    insert into public.tasks (user_id, title, recurrence_rule, due_date) values ('00000000-0000-0000-0000-0000000000a1', 'bad', 'FREQ=HOURLY', current_date);
    raise exception 'FAIL: bad rule accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks (user_id, title, recurrence_rule) values ('00000000-0000-0000-0000-0000000000a1', 'undated', 'FREQ=DAILY');
    raise exception 'FAIL: undated repeating task accepted';
  exception when check_violation then null;
  end;
end $$;

-- A series has at most one open occurrence.
insert into public.tasks (user_id, title, recurrence_rule, due_date, series_id, status, completed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Water', 'FREQ=DAILY', current_date - 1, '50000000-0000-0000-0000-000000000001', 'done', now()),
  ('00000000-0000-0000-0000-0000000000a1', 'Water', 'FREQ=DAILY', current_date, '50000000-0000-0000-0000-000000000001', 'todo', null);
do $$ begin
  begin
    insert into public.tasks (user_id, title, recurrence_rule, due_date, series_id) values
      ('00000000-0000-0000-0000-0000000000a1', 'Water', 'FREQ=DAILY', current_date + 1, '50000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: two open occurrences in one series';
  exception when unique_violation then null;
  end;
end $$;

-- Saved view names are unique per module, ignoring case.
do $$ begin
  begin
    insert into public.saved_views (user_id, module_key, name) values ('00000000-0000-0000-0000-0000000000a1', 'tasks', 'client WORK');
    raise exception 'FAIL: duplicate view name accepted';
  exception when unique_violation then null;
  end;
end $$;

-- In-app delivery of one reminder occurrence is recorded once.
insert into public.reminders (id, user_id, title, remind_at) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Vitamins', now() - interval '1 minute');
insert into public.reminder_deliveries (user_id, reminder_id, channel, status, scheduled_for)
  select '00000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-000000000001', 'in_app', 'sent', remind_at from public.reminders where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    insert into public.reminder_deliveries (user_id, reminder_id, channel, status, scheduled_for)
      select '00000000-0000-0000-0000-0000000000a1', id, 'in_app', 'sent', remind_at from public.reminders where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: duplicate delivery accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Bob sees none of it and can't attach to it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.saved_views) <> 0 then raise exception 'FAIL: Bob sees saved views'; end if;
  if (select count(*) from public.task_dependencies) <> 0 then raise exception 'FAIL: Bob sees dependencies'; end if;
  if (select count(*) from public.calendar_events) <> 0 then raise exception 'FAIL: Bob sees events'; end if;
  if (select count(*) from public.habits) <> 0 then raise exception 'FAIL: Bob sees habits'; end if;
  if (select count(*) from public.reminder_deliveries) <> 0 then raise exception 'FAIL: Bob sees deliveries'; end if;
  if (select count(*) from public.tasks where title ilike '%water%') <> 0 then raise exception 'FAIL: Bob search finds Alice tasks'; end if;
  begin
    insert into public.habit_logs (user_id, habit_id, log_date) values ('00000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-000000000001', current_date);
    raise exception 'FAIL: Bob logged Alice''s habit';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.task_dependencies (user_id, task_id, depends_on_task_id) values
      ('00000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: Bob linked Alice''s tasks';
  exception when foreign_key_violation then null;
  end;
  update public.saved_views set name = 'hijack';
  delete from public.habits;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  if (select name from public.saved_views) <> 'Client work' then raise exception 'FAIL: Bob changed Alice''s view'; end if;
  if (select count(*) from public.habits) <> 1 then raise exception 'FAIL: Bob deleted Alice''s habit'; end if;
end $$;

reset role;
select 'Phase 2 database tests passed' as result;
rollback;
