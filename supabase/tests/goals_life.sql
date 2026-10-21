-- Phase 3 database rules: goal hierarchy, one running timer, keep-in-touch
-- sync, link cleanup and isolation of the new tables. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a3', 'alice3@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'bob3@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);

-- Goals: a parent must be broader, and a goal can't sit under its own sub-goal.
insert into public.goals (id, user_id, level, title) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'vision', 'Vision'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'annual', 'Year');
update public.goals set parent_id = '50000000-0000-0000-0000-000000000001' where id = '50000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    insert into public.goals (user_id, level, title, parent_id) values ('00000000-0000-0000-0000-0000000000a3', 'vision', 'Same level', '50000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: goal under a goal of the same level accepted';
  exception when check_violation then null;
  end;
  begin
    update public.goals set level = 'quarterly', parent_id = '50000000-0000-0000-0000-000000000002' where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: goal loop accepted';
  exception when check_violation then null;
  end;
end $$;

-- Time tracking: only one running timer per person; entries can't run backwards.
insert into public.time_entries (user_id, started_at) values ('00000000-0000-0000-0000-0000000000a3', now() - interval '1 hour');
do $$ begin
  begin
    insert into public.time_entries (user_id, started_at) values ('00000000-0000-0000-0000-0000000000a3', now());
    raise exception 'FAIL: second running timer accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.time_entries (user_id, started_at, ended_at) values ('00000000-0000-0000-0000-0000000000a3', now(), now() - interval '1 minute');
    raise exception 'FAIL: backwards time entry accepted';
  exception when check_violation then null;
  end;
end $$;

-- Relationships: last_contacted_on follows the newest interaction.
insert into public.people (id, user_id, name, contact_every_days) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'Hana', 14);
insert into public.interactions (id, user_id, person_id, occurred_on, kind) values
  ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-000000000001', '2026-10-01', 'call'),
  ('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-000000000001', '2026-10-10', 'visit');
do $$ begin
  if (select last_contacted_on from public.people where id = '60000000-0000-0000-0000-000000000001') <> '2026-10-10' then raise exception 'FAIL: last contact not synced on insert'; end if;
end $$;
delete from public.interactions where id = '61000000-0000-0000-0000-000000000002';
do $$ begin
  if (select last_contacted_on from public.people where id = '60000000-0000-0000-0000-000000000001') <> '2026-10-01' then raise exception 'FAIL: last contact not synced on delete'; end if;
end $$;

-- Home admin: renewals need a date; documents don't.
insert into public.admin_items (user_id, kind, title) values ('00000000-0000-0000-0000-0000000000a3', 'document', 'Deed');
do $$ begin
  begin
    insert into public.admin_items (user_id, kind, title) values ('00000000-0000-0000-0000-0000000000a3', 'renewal', 'Undated renewal');
    raise exception 'FAIL: undated renewal accepted';
  exception when check_violation then null;
  end;
end $$;

-- Notes: deleting a note removes its links in both directions.
insert into public.notes (id, user_id, title, body) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'One', 'See [[Two]]'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Two', 'Searchable kitchen text');
insert into public.record_links (user_id, from_type, from_id, to_type, to_id) values
  ('00000000-0000-0000-0000-0000000000a3', 'note', '70000000-0000-0000-0000-000000000001', 'note', '70000000-0000-0000-0000-000000000002');
do $$ begin
  if (select count(*) from public.notes where search @@ websearch_to_tsquery('simple', 'kitchen')) <> 1 then raise exception 'FAIL: note search'; end if;
end $$;
delete from public.notes where id = '70000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from public.record_links) <> 0 then raise exception 'FAIL: links to a deleted note remain'; end if;
end $$;

insert into public.journal_entries (user_id, entry_date, body) values ('00000000-0000-0000-0000-0000000000a3', current_date, 'Private thoughts');
insert into public.personal_values (user_id, name) values ('00000000-0000-0000-0000-0000000000a3', 'Faith');
insert into public.learning_items (user_id, kind, title) values ('00000000-0000-0000-0000-0000000000a3', 'book', 'A book');
insert into public.skills (user_id, name) values ('00000000-0000-0000-0000-0000000000a3', 'Drawing');
insert into public.milestones (user_id, goal_id, title) values ('00000000-0000-0000-0000-0000000000a3', '50000000-0000-0000-0000-000000000002', 'First step');

-- Bob sees and changes none of it, and can't attach his rows to Alice's.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
do $$
declare t text;
begin
  foreach t in array array['goals','milestones','time_entries','people','interactions','admin_items','notes','journal_entries','personal_values','learning_items','skills'] loop
    execute format('select count(*) from public.%I', t) into strict t;
    if t::int <> 0 then raise exception 'FAIL: Bob can read Alice''s rows'; end if;
  end loop;
  begin
    insert into public.interactions (user_id, person_id, occurred_on) values ('00000000-0000-0000-0000-0000000000b3', '60000000-0000-0000-0000-000000000001', current_date);
    raise exception 'FAIL: Bob logged an interaction on Alice''s contact';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.milestones (user_id, goal_id, title) values ('00000000-0000-0000-0000-0000000000b3', '50000000-0000-0000-0000-000000000001', 'x');
    raise exception 'FAIL: Bob attached a milestone to Alice''s goal';
  exception when foreign_key_violation then null;
  end;
  update public.journal_entries set body = 'hijack';
  delete from public.people;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
do $$ begin
  if (select body from public.journal_entries) <> 'Private thoughts' then raise exception 'FAIL: Bob changed Alice''s journal'; end if;
  if (select count(*) from public.people) <> 1 then raise exception 'FAIL: Bob deleted Alice''s contact'; end if;
end $$;

reset role;
select 'Phase 3 database tests passed' as result;
rollback;
