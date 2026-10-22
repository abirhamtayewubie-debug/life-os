-- Phase 8 database rules: deleting your account removes every row you own
-- (including linked and paired rows guarded by triggers), only ever your own,
-- and can't be called without signing in.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a8', 'alice8@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b8', 'bob8@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

-- Not signed in: refused.
set local role anon;
do $$ begin
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: anon could call delete_my_account';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Alice and Bob each own a spread of data, including rows that triggers guard.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
insert into public.projects (id, user_id, name) values ('78000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'House');
insert into public.tasks (id, user_id, project_id, title) values
  ('78000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-000000000001', 'Pour slab'),
  ('78000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a8', null, 'Order rebar');
insert into public.task_dependencies (user_id, task_id, depends_on_task_id) values
  ('00000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-000000000002', '78000000-0000-0000-0000-000000000003');
insert into public.financial_accounts (id, user_id, name, kind, currency, opening_balance) values
  ('78000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a8', 'Bank', 'checking', 'ETB', 1000),
  ('78000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a8', 'Cash', 'cash', 'ETB', 0);
select public.create_transfer('78000000-0000-0000-0000-000000000004', '78000000-0000-0000-0000-000000000005', 300, 300, '2026-10-01', 'ATM');
insert into public.notes (id, user_id, title, body) values ('78000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a8', 'Ideas', 'x');
insert into public.record_links (user_id, from_type, from_id, to_type, to_id) values
  ('00000000-0000-0000-0000-0000000000a8', 'note', '78000000-0000-0000-0000-000000000006', 'task', '78000000-0000-0000-0000-000000000002');
insert into public.journal_entries (user_id, entry_date, body) values ('00000000-0000-0000-0000-0000000000a8', '2026-10-20', 'Private thoughts');
insert into public.workouts (id, user_id, performed_on, activity) values ('78000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000a8', '2026-10-20', 'Run');
insert into public.workout_sets (user_id, workout_id, exercise, set_number, reps) values ('00000000-0000-0000-0000-0000000000a8', '78000000-0000-0000-0000-000000000007', 'Sprint', 1, 4);
insert into public.ai_conversations (id, user_id, title) values ('78000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000a8', 'Plan');
insert into public.audit_events (user_id, action) values ('00000000-0000-0000-0000-0000000000a8', 'export.json');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', true);
insert into public.tasks (user_id, title) values ('00000000-0000-0000-0000-0000000000b8', 'Bob task');
insert into public.journal_entries (user_id, entry_date, body) values ('00000000-0000-0000-0000-0000000000b8', '2026-10-20', 'Bob thoughts');

-- Alice deletes her account.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
select public.delete_my_account();
reset role;

-- Nothing of Alice's remains anywhere; Bob's data is untouched.
do $$
declare t text; n bigint; left_over text := '';
begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a8') then raise exception 'FAIL: auth user remains'; end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a8') then raise exception 'FAIL: profile remains'; end if;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'user_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where user_id = %L', t, '00000000-0000-0000-0000-0000000000a8') into n;
    if n > 0 then left_over := left_over || t || ' '; end if;
  end loop;
  if left_over <> '' then raise exception 'FAIL: rows left after deletion in %', left_over; end if;
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000b8') then raise exception 'FAIL: Bob deleted'; end if;
  if (select count(*) from public.tasks where user_id = '00000000-0000-0000-0000-0000000000b8') <> 1 then raise exception 'FAIL: Bob task touched'; end if;
  if (select count(*) from public.journal_entries where user_id = '00000000-0000-0000-0000-0000000000b8') <> 1 then raise exception 'FAIL: Bob journal touched'; end if;
end $$;

-- The function is the only privileged path, and it takes no target.
do $$ begin
  if (select pronargs from pg_proc where proname = 'delete_my_account') <> 0 then raise exception 'FAIL: delete_my_account takes arguments'; end if;
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then raise exception 'FAIL: anon may execute'; end if;
end $$;

select 'Phase 8 database tests passed' as result;
rollback;
