-- Row isolation tests. Run with: npm run test:db
-- Everything happens inside a transaction that is rolled back.
\set ON_ERROR_STOP on
begin;

-- 1. Every table in public has RLS enabled and forced (except reference data).
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (not c.relrowsecurity or (not c.relforcerowsecurity and c.relname <> 'currencies'));
  if bad is not null then
    raise exception 'RLS not enabled+forced on: %', bad;
  end if;
end $$;

-- 2. Two users.
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

do $$ begin
  if (select count(*) from public.profiles where id in ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b')) <> 2 then
    raise exception 'profile trigger did not create profiles';
  end if;
end $$;

-- 3. Act as Alice and create data.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.projects (id, user_id, name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Alice project');
insert into public.tasks (user_id, project_id, title, source) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'Alice task', 'manual'),
  ('00000000-0000-0000-0000-00000000000a', null, 'Alice sample task', 'sample');
insert into public.journal_entries (user_id, entry_date, body) values
  ('00000000-0000-0000-0000-00000000000a', current_date, 'Private thoughts');
insert into public.financial_accounts (id, user_id, name, kind, currency, opening_balance) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Wallet', 'cash', 'ETB', 1000);
insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'expense', -250.5, 'ETB', current_date);

do $$ begin
  if (select balance from public.account_balances where account_id = '20000000-0000-0000-0000-00000000000a') <> 749.5 then
    raise exception 'account balance view incorrect';
  end if;
end $$;

-- Alice cannot write a row for Bob.
do $$ begin
  begin
    insert into public.tasks (user_id, title) values ('00000000-0000-0000-0000-00000000000b', 'spoof');
    raise exception 'FAIL: inserted a task for another user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Transaction currency must match the account currency.
do $$ begin
  begin
    insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on) values
      ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'expense', -1, 'USD', current_date);
    raise exception 'FAIL: currency mismatch accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Expense sign is enforced.
do $$ begin
  begin
    insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on) values
      ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'expense', 10, 'ETB', current_date);
    raise exception 'FAIL: positive expense accepted';
  exception when check_violation then null;
  end;
end $$;

-- Audit log is append-only for the user.
insert into public.audit_events (user_id, action) values ('00000000-0000-0000-0000-00000000000a', 'test.event');
update public.audit_events set action = 'tampered' where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from public.audit_events where action = 'tampered') then
    raise exception 'FAIL: audit event was updated';
  end if;
end $$;

-- Integration credentials are unreadable from a user session.
do $$ begin
  begin
    perform 1 from public.integration_credentials;
    raise exception 'FAIL: integration_credentials readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Act as Bob: sees nothing of Alice's, cannot modify or reference it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$ begin
  if (select count(*) from public.tasks) <> 0 then raise exception 'FAIL: Bob sees Alice tasks'; end if;
  if (select count(*) from public.projects) <> 0 then raise exception 'FAIL: Bob sees Alice projects'; end if;
  if (select count(*) from public.journal_entries) <> 0 then raise exception 'FAIL: Bob sees Alice journal'; end if;
  if (select count(*) from public.transactions) <> 0 then raise exception 'FAIL: Bob sees Alice transactions'; end if;
  if (select count(*) from public.account_balances) <> 0 then raise exception 'FAIL: Bob sees Alice balances'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: Bob sees other profiles'; end if;
  if (select count(*) from public.audit_events) <> 0 then raise exception 'FAIL: Bob sees Alice audit log'; end if;
end $$;

update public.tasks set title = 'hacked';
delete from public.projects;

-- Bob cannot attach his task to Alice's project (composite FK).
do $$ begin
  begin
    insert into public.tasks (user_id, project_id, title) values
      ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'cross link');
    raise exception 'FAIL: cross-user project reference accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Bob purging sample data must not touch Alice's sample rows.
select public.purge_sample_data();

-- 5. Back as Alice: her data is intact; her purge removes only sample rows.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.tasks where title like 'Alice%') <> 2 then raise exception 'FAIL: Alice tasks changed by Bob'; end if;
  if (select count(*) from public.projects) <> 1 then raise exception 'FAIL: Alice project deleted by Bob'; end if;
end $$;

do $$
declare removed integer;
begin
  removed := public.purge_sample_data();
  if removed <> 1 then raise exception 'FAIL: expected 1 sample row purged, got %', removed; end if;
  if (select count(*) from public.tasks) <> 1 then raise exception 'FAIL: purge removed manual data'; end if;
end $$;

-- 6. Anonymous role sees nothing.
reset role;
set local role anon;
do $$ begin
  begin
    if (select count(*) from public.tasks) <> 0 then raise exception 'FAIL: anon sees tasks'; end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.currencies) < 3 then raise exception 'FAIL: anon cannot read currencies'; end if;
end $$;

reset role;
select 'RLS isolation tests passed' as result;
rollback;
