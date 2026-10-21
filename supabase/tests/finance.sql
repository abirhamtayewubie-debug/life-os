-- Phase 4 database rules: atomic transfers, bill payments, category and
-- budget integrity, and isolation of money data between people.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a4', 'alice4@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'bob4@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);

insert into public.financial_accounts (id, user_id, name, kind, currency, opening_balance) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'Bank', 'checking', 'ETB', 1000),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a4', 'Cash', 'cash', 'ETB', 0),
  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a4', 'Payoneer', 'checking', 'USD', 0),
  ('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a4', 'Card', 'credit_card', 'ETB', -500);

-- Liabilities are flagged from the account kind.
do $$ begin
  if not (select is_liability from public.financial_accounts where id = '70000000-0000-0000-0000-000000000004') then raise exception 'FAIL: card not a liability'; end if;
end $$;

-- Transfers: two legs, balances move, deleting one side deletes both.
select public.create_transfer('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 300, 300, '2026-10-01', 'ATM') as t1 \gset
do $$ begin
  if (select count(*) from public.transactions where kind = 'transfer') <> 2 then raise exception 'FAIL: transfer should make two legs'; end if;
  if (select balance from public.account_balances where account_id = '70000000-0000-0000-0000-000000000001') <> 700 then raise exception 'FAIL: bank balance after transfer'; end if;
  if (select balance from public.account_balances where account_id = '70000000-0000-0000-0000-000000000002') <> 300 then raise exception 'FAIL: cash balance after transfer'; end if;
end $$;

-- Cross-currency transfers keep what was sent and what arrived.
select public.create_transfer('70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 10, 1250, '2026-10-02', null) as t2 \gset
do $$ begin
  if (select balance from public.account_balances where account_id = '70000000-0000-0000-0000-000000000001') <> 1950 then raise exception 'FAIL: cross-currency arrival'; end if;
  if (select balance from public.account_balances where account_id = '70000000-0000-0000-0000-000000000003') <> -10 then raise exception 'FAIL: cross-currency sent'; end if;
end $$;

do $$ begin
  begin
    perform public.create_transfer('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 5, 5, '2026-10-01', null);
    raise exception 'FAIL: transfer to the same account accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_transfer('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 5, 6, '2026-10-01', null);
    raise exception 'FAIL: same-currency transfer with different amounts accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.create_transfer('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', -5, -5, '2026-10-01', null);
    raise exception 'FAIL: negative transfer accepted';
  exception when check_violation then null;
  end;
end $$;

-- A transfer leg can't be turned into spending or moved to another account.
do $$ begin
  begin
    update public.transactions set kind = 'expense', transfer_group_id = null where kind = 'transfer' and amount = -300;
    raise exception 'FAIL: transfer leg turned into an expense';
  exception when check_violation then null;
  end;
  begin
    update public.transactions set account_id = '70000000-0000-0000-0000-000000000004' where kind = 'transfer' and amount = 300;
    raise exception 'FAIL: transfer leg moved to another account';
  exception when check_violation or foreign_key_violation then null;
  end;
end $$;
-- Description and date can still be corrected.
update public.transactions set description = 'Cash for the week' where kind = 'transfer' and amount = -300;

delete from public.transactions where kind = 'transfer' and amount = -300;
do $$ begin
  if exists (select 1 from public.transactions where kind = 'transfer' and amount = 300) then raise exception 'FAIL: transfer sibling not deleted'; end if;
  if (select count(*) from public.transactions where kind = 'transfer') <> 2 then raise exception 'FAIL: other transfer touched'; end if;
end $$;

-- Categories: a sub-category sits under a top-level category of the same kind;
-- transactions and budget lines use the right kind.
insert into public.transaction_categories (id, user_id, kind, name) values
  ('71000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'expense', 'Food'),
  ('71000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a4', 'income', 'Salary');
insert into public.transaction_categories (id, user_id, kind, name, parent_id) values
  ('71000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a4', 'expense', 'Groceries', '71000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.transaction_categories (user_id, kind, name, parent_id) values ('00000000-0000-0000-0000-0000000000a4', 'income', 'Mixed', '71000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: income category under an expense category';
  exception when check_violation then null;
  end;
  begin
    insert into public.transaction_categories (user_id, kind, name, parent_id) values ('00000000-0000-0000-0000-0000000000a4', 'expense', 'Too deep', '71000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: third category level accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.transactions (user_id, account_id, category_id, kind, amount, currency, occurred_on)
    values ('00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 'expense', -10, 'ETB', '2026-10-03');
    raise exception 'FAIL: expense in an income category';
  exception when check_violation then null;
  end;
end $$;
insert into public.transactions (user_id, account_id, category_id, kind, amount, currency, occurred_on)
values ('00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003', 'expense', -40, 'ETB', '2026-10-03');

insert into public.budgets (id, user_id, name, currency, starts_on) values
  ('72000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'Monthly', 'ETB', '2026-10-01');
insert into public.budget_lines (user_id, budget_id, category_id, amount) values
  ('00000000-0000-0000-0000-0000000000a4', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 500);
do $$ begin
  begin
    insert into public.budget_lines (user_id, budget_id, category_id, amount) values ('00000000-0000-0000-0000-0000000000a4', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 100);
    raise exception 'FAIL: budget line for an income category';
  exception when check_violation then null;
  end;
end $$;

-- Deleting a category leaves its transactions uncategorised.
delete from public.transaction_categories where id = '71000000-0000-0000-0000-000000000003';
do $$ begin
  if (select category_id from public.transactions where amount = -40) is not null then raise exception 'FAIL: transaction kept a deleted category'; end if;
end $$;

-- Bills: must be money out; recording a payment adds a transaction and moves the date on.
do $$ begin
  begin
    insert into public.recurring_transactions (user_id, account_id, currency, description, amount, next_due_on, is_bill)
    values ('00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', 'ETB', 'Positive bill', 100, '2026-10-31', true);
    raise exception 'FAIL: positive bill accepted';
  exception when check_violation then null;
  end;
end $$;
insert into public.recurring_transactions (id, user_id, account_id, category_id, currency, description, amount, next_due_on, is_bill, ends_on) values
  ('73000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'ETB', 'Internet', -1200, '2026-01-31', true, '2026-03-15');
select public.record_recurring_payment('73000000-0000-0000-0000-000000000001', '2026-01-30', null);
do $$ begin
  if (select next_due_on from public.recurring_transactions where id = '73000000-0000-0000-0000-000000000001') <> '2026-02-28' then raise exception 'FAIL: next due date (month end) not clamped'; end if;
  if not exists (select 1 from public.transactions where recurring_id = '73000000-0000-0000-0000-000000000001' and amount = -1200 and kind = 'expense') then raise exception 'FAIL: payment transaction missing'; end if;
end $$;
select public.record_recurring_payment('73000000-0000-0000-0000-000000000001', '2026-02-27', 1300);
do $$ begin
  if not exists (select 1 from public.transactions where recurring_id = '73000000-0000-0000-0000-000000000001' and amount = -1300) then raise exception 'FAIL: custom payment amount should keep the bill sign'; end if;
  if (select archived_at from public.recurring_transactions where id = '73000000-0000-0000-0000-000000000001') is null then raise exception 'FAIL: bill past its end date not archived'; end if;
end $$;

-- Exchange rates: one per pair per day.
insert into public.exchange_rates (user_id, base, quote, rate, as_of) values ('00000000-0000-0000-0000-0000000000a4', 'USD', 'ETB', 125.5, '2026-10-01');
do $$ begin
  begin
    insert into public.exchange_rates (user_id, base, quote, rate, as_of) values ('00000000-0000-0000-0000-0000000000a4', 'USD', 'ETB', 126, '2026-10-01');
    raise exception 'FAIL: duplicate rate for the same day';
  exception when unique_violation then null;
  end;
end $$;

-- Re-importing a statement row is refused by the external id.
insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on, external_id, source)
values ('00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', 'expense', -5, 'ETB', '2026-10-04', 'csv:2026-10-04|-5|coffee|1', 'imported');
do $$ begin
  begin
    insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on, external_id, source)
    values ('00000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-000000000001', 'expense', -5, 'ETB', '2026-10-04', 'csv:2026-10-04|-5|coffee|1', 'imported');
    raise exception 'FAIL: duplicate import accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Isolation: Bob sees none of it and can't use Alice's accounts or bills.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.financial_accounts) then raise exception 'FAIL: Bob sees accounts'; end if;
  if exists (select 1 from public.account_balances) then raise exception 'FAIL: Bob sees balances'; end if;
  if exists (select 1 from public.transactions) then raise exception 'FAIL: Bob sees transactions'; end if;
  if exists (select 1 from public.transaction_categories) then raise exception 'FAIL: Bob sees categories'; end if;
  if exists (select 1 from public.budgets) or exists (select 1 from public.budget_lines) then raise exception 'FAIL: Bob sees budgets'; end if;
  if exists (select 1 from public.recurring_transactions) then raise exception 'FAIL: Bob sees bills'; end if;
  if exists (select 1 from public.exchange_rates) then raise exception 'FAIL: Bob sees rates'; end if;
  begin
    perform public.create_transfer('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 1, 1, '2026-10-05', null);
    raise exception 'FAIL: Bob moved Alice''s money';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.record_recurring_payment('73000000-0000-0000-0000-000000000001', '2026-10-05', null);
    raise exception 'FAIL: Bob recorded Alice''s bill';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on)
    values ('00000000-0000-0000-0000-0000000000b4', '70000000-0000-0000-0000-000000000001', 'expense', -1, 'ETB', '2026-10-05');
    raise exception 'FAIL: Bob wrote into Alice''s account';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  update public.financial_accounts set name = 'hacked';
  delete from public.transactions;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.financial_accounts where name = 'hacked') then raise exception 'FAIL: Bob renamed an account'; end if;
  if (select count(*) from public.transactions) < 4 then raise exception 'FAIL: Bob deleted transactions'; end if;
end $$;

-- Helper trigger functions aren't callable directly.
do $$ begin
  if has_function_privilege('authenticated', 'public.delete_transfer_sibling()', 'execute') then raise exception 'FAIL: trigger helper callable'; end if;
end $$;

reset role;
select 'Phase 4 database tests passed' as result;
rollback;
