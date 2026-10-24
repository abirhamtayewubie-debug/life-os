-- Personal loans: the opening transfer, balances, ownership, and what a
-- delete takes with it. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000ac', 'alice12@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000bc', 'bob12@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated"}', true);

insert into public.financial_accounts (id, user_id, name, kind, currency, opening_balance) values
  ('4c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ac', 'Bank', 'checking', 'ETB', 10000),
  ('4c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ac', 'Dollars', 'checking', 'USD', 100);
insert into public.people (id, user_id, name) values
  ('4c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ac', 'Dawit');

do $$
declare borrowed uuid; lent uuid; cash_loan uuid; acc uuid;
begin
  -- Borrowed 5000 into the bank: the loan owes 5000, the bank has 15000.
  borrowed := public.create_personal_loan('borrowed', ' Dawit ', '4c000000-0000-0000-0000-000000000003', 5000, 'ETB', current_date, current_date + 30, null, null, '4c000000-0000-0000-0000-000000000001');
  select account_id into acc from public.personal_loans where id = borrowed;
  if (select balance from public.account_balances where account_id = acc) <> -5000 then raise exception 'FAIL: borrowed balance'; end if;
  if (select kind from public.financial_accounts where id = acc) <> 'loan' then raise exception 'FAIL: borrowed kind'; end if;
  if (select name from public.financial_accounts where id = acc) <> 'Borrowed from Dawit' then raise exception 'FAIL: account name'; end if;
  if (select balance from public.account_balances where account_id = '4c000000-0000-0000-0000-000000000001') <> 15000 then raise exception 'FAIL: bank after borrowing'; end if;
  if exists (select 1 from public.transactions where account_id = acc and kind <> 'transfer') then raise exception 'FAIL: borrowing counted as income'; end if;

  -- Lent 2000 out of the bank: owed 2000 to me, bank back to 13000.
  lent := public.create_personal_loan('lent', 'Selam', null, 2000, 'ETB', current_date, null, null, 'School fees', '4c000000-0000-0000-0000-000000000001');
  select account_id into acc from public.personal_loans where id = lent;
  if (select balance from public.account_balances where account_id = acc) <> 2000 then raise exception 'FAIL: lent balance'; end if;
  if (select balance from public.account_balances where account_id = '4c000000-0000-0000-0000-000000000001') <> 13000 then raise exception 'FAIL: bank after lending'; end if;

  -- Without an account the loan starts at its opening balance and no money moves.
  cash_loan := public.create_personal_loan('borrowed', 'Mum', null, 300, 'ETB', current_date);
  select account_id into acc from public.personal_loans where id = cash_loan;
  if (select balance from public.account_balances where account_id = acc) <> -300 then raise exception 'FAIL: opening-balance loan'; end if;
  if exists (select 1 from public.transactions where account_id = acc) then raise exception 'FAIL: cash loan wrote a transaction'; end if;

  begin
    perform public.create_personal_loan('lent', 'X', null, 50, 'ETB', current_date, null, null, null, '4c000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: loan through an account in another currency';
  exception when check_violation then null;
  end;
  begin
    perform public.create_personal_loan('lent', 'X', null, 0, 'ETB', current_date);
    raise exception 'FAIL: zero loan accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_personal_loan('lent', 'X', null, 10, 'ETB', current_date, current_date - 1);
    raise exception 'FAIL: due before it started';
  exception when check_violation then null;
  end;
end $$;

-- Bob can't see Alice's loans or point one at her account or person.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bc","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.personal_loans) <> 0 then raise exception 'FAIL: Bob sees Alice''s loans'; end if;
  begin
    perform public.create_personal_loan('lent', 'X', null, 10, 'ETB', current_date, null, null, null, '4c000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: Bob lent through Alice''s bank';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.create_personal_loan('lent', 'X', '4c000000-0000-0000-0000-000000000003', 10, 'ETB', current_date);
    raise exception 'FAIL: Bob linked Alice''s person';
  exception when foreign_key_violation then null;
  end;
  update public.personal_loans set person_name = 'Hijacked';
end $$;

-- Deleting a loan's account removes the loan and both sides of its transfers;
-- deleting the person keeps the loan.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ac","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.personal_loans where person_name = 'Hijacked') then raise exception 'FAIL: Bob changed a loan'; end if;
  delete from public.people where id = '4c000000-0000-0000-0000-000000000003';
  if (select count(*) from public.personal_loans where person_name = 'Dawit' and person_id is null) <> 1 then raise exception 'FAIL: loan lost with its person'; end if;
  delete from public.financial_accounts where id = (select account_id from public.personal_loans where person_name = 'Dawit');
  if exists (select 1 from public.personal_loans where person_name = 'Dawit') then raise exception 'FAIL: loan outlived its account'; end if;
  if (select balance from public.account_balances where account_id = '4c000000-0000-0000-0000-000000000001') <> 8000 then raise exception 'FAIL: bank kept the deleted loan''s transfer'; end if;
end $$;

rollback;
\echo 'personal_loans: ok'
