-- Projects record when they were finished. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000ac', 'alice12@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated"}', true);

insert into public.projects (id, user_id, name) values ('4c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ac', 'Site');
insert into public.projects (id, user_id, name, status) values ('4c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ac', 'Done already', 'completed');

do $$
declare first timestamptz;
begin
  if (select completed_at from public.projects where id = '4c000000-0000-0000-0000-000000000001') is not null then raise exception 'FAIL: active project has a completion date'; end if;
  if (select completed_at from public.projects where id = '4c000000-0000-0000-0000-000000000002') is null then raise exception 'FAIL: project created as completed has no date'; end if;

  update public.projects set status = 'completed' where id = '4c000000-0000-0000-0000-000000000001';
  select completed_at into first from public.projects where id = '4c000000-0000-0000-0000-000000000001';
  if first is null then raise exception 'FAIL: completing did not stamp the date'; end if;

  update public.projects set name = 'Site (renamed)' where id = '4c000000-0000-0000-0000-000000000001';
  update public.projects set status = 'completed' where id = '4c000000-0000-0000-0000-000000000001';
  if (select completed_at from public.projects where id = '4c000000-0000-0000-0000-000000000001') <> first then raise exception 'FAIL: date moved on a later edit'; end if;

  update public.projects set status = 'active' where id = '4c000000-0000-0000-0000-000000000001';
  if (select completed_at from public.projects where id = '4c000000-0000-0000-0000-000000000001') is not null then raise exception 'FAIL: reopening kept the date'; end if;
end $$;

rollback;
\echo 'project_completed: ok'
