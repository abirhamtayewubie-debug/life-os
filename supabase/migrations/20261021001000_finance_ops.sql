-- Life OS · 0010 · Finance operations
-- Atomic transfers and bill payments, transfer-leg integrity, and a few
-- constraints the finance screens rely on. Functions are security invoker:
-- they run as the caller, so RLS and the composite foreign keys still decide
-- what may be touched. They never call into schema private (app roles have
-- no usage on it).

-- ---------------------------------------------------------------------------
-- Transfers: two legs, one group. Money leaves one account (negative) and
-- arrives in another (positive). Cross-currency transfers state both amounts;
-- nothing is converted for the user.
-- ---------------------------------------------------------------------------
create or replace function public.create_transfer(
  p_from_account uuid,
  p_to_account   uuid,
  p_from_amount  numeric,
  p_to_amount    numeric,
  p_occurred_on  date,
  p_description  text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  grp uuid := gen_random_uuid();
  from_cur char(3);
  to_cur char(3);
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_from_account = p_to_account then raise exception 'Pick two different accounts' using errcode = '23514'; end if;
  if p_from_amount is null or p_from_amount <= 0 or p_to_amount is null or p_to_amount <= 0 then
    raise exception 'Transfer amounts must be positive' using errcode = '23514';
  end if;
  select currency into from_cur from public.financial_accounts where id = p_from_account and archived_at is null;
  select currency into to_cur from public.financial_accounts where id = p_to_account and archived_at is null;
  if from_cur is null or to_cur is null then raise exception 'Account not found' using errcode = '23503'; end if;
  if from_cur = to_cur and p_from_amount <> p_to_amount then
    raise exception 'Same-currency transfers move the same amount' using errcode = '23514';
  end if;

  insert into public.transactions (user_id, account_id, kind, amount, currency, occurred_on, description, transfer_group_id, source)
  values
    (uid, p_from_account, 'transfer', -p_from_amount, from_cur, p_occurred_on, p_description, grp, 'manual'),
    (uid, p_to_account,   'transfer',  p_to_amount,   to_cur,   p_occurred_on, p_description, grp, 'manual');
  return grp;
end;
$$;
revoke execute on function public.create_transfer(uuid, uuid, numeric, numeric, date, text) from public, anon;
grant execute on function public.create_transfer(uuid, uuid, numeric, numeric, date, text) to authenticated;

-- Deleting one leg of a transfer deletes the other, so balances never show
-- money that left one account and arrived nowhere.
create or replace function public.delete_transfer_sibling()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.transfer_group_id is not null then
    delete from public.transactions where transfer_group_id = old.transfer_group_id and id <> old.id and user_id = old.user_id;
  end if;
  return old;
end;
$$;
revoke execute on function public.delete_transfer_sibling() from public, anon, authenticated;
create trigger delete_transfer_sibling after delete on public.transactions
  for each row execute function public.delete_transfer_sibling();

-- Transfer legs keep their direction and group; editing amounts or accounts
-- of a transfer goes through delete + create_transfer instead.
create or replace function public.guard_transfer_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'transfer' and (new.kind <> 'transfer' or new.transfer_group_id is distinct from old.transfer_group_id
      or new.account_id <> old.account_id or sign(new.amount) <> sign(old.amount)) then
    raise exception 'Delete and re-create a transfer to change its accounts or direction' using errcode = '23514';
  end if;
  if new.kind = 'transfer' and old.kind <> 'transfer' then
    raise exception 'Use a transfer to move money between accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_transfer_update() from public, anon, authenticated;
create trigger guard_transfer_update before update on public.transactions
  for each row execute function public.guard_transfer_update();

-- ---------------------------------------------------------------------------
-- Bills and subscriptions: recording a payment writes the transaction and
-- moves the due date on in one step. Nothing is ever paid automatically.
-- ---------------------------------------------------------------------------
create or replace function public.record_recurring_payment(
  p_recurring_id uuid,
  p_occurred_on  date,
  p_amount       numeric default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.recurring_transactions%rowtype;
  amt numeric;
  tx_id uuid;
  next_due date;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into r from public.recurring_transactions where id = p_recurring_id and archived_at is null for update;
  if not found then raise exception 'Bill not found' using errcode = '23503'; end if;
  -- A custom amount keeps the item's direction: a bill stays money out.
  amt := sign(r.amount) * abs(coalesce(p_amount, r.amount));
  if amt = 0 then raise exception 'Amount can''t be zero' using errcode = '23514'; end if;

  insert into public.transactions (user_id, account_id, category_id, recurring_id, kind, amount, currency, occurred_on, description, source)
  values (uid, r.account_id, r.category_id, r.id, case when amt < 0 then 'expense' else 'income' end::public.transaction_kind,
          amt, r.currency, p_occurred_on, r.description, 'manual')
  returning id into tx_id;

  next_due := case r.unit
    when 'week'  then r.next_due_on + (r.every_n * 7)
    when 'month' then (r.next_due_on + make_interval(months => r.every_n))::date
    else              (r.next_due_on + make_interval(years => r.every_n))::date
  end;
  if r.ends_on is not null and next_due > r.ends_on then
    update public.recurring_transactions set archived_at = now() where id = r.id;
  else
    update public.recurring_transactions set next_due_on = next_due where id = r.id;
  end if;
  return tx_id;
end;
$$;
revoke execute on function public.record_recurring_payment(uuid, date, numeric) from public, anon;
grant execute on function public.record_recurring_payment(uuid, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Constraints the screens rely on
-- ---------------------------------------------------------------------------
-- A category's parent must be the same kind (no income under expense).
create or replace function public.check_category_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.transaction_categories p where p.id = new.parent_id and (p.kind <> new.kind or p.parent_id is not null)
  ) then
    raise exception 'A sub-category must sit under a top-level category of the same kind' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_category_parent() from public, anon, authenticated;
create trigger check_category_parent before insert or update of parent_id, kind on public.transaction_categories
  for each row execute function public.check_category_parent();

-- Expense categories only take expenses; income categories only income.
create or replace function public.check_transaction_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare ck public.category_kind;
begin
  if new.category_id is null or new.kind in ('transfer', 'adjustment') then return new; end if;
  select kind into ck from public.transaction_categories where id = new.category_id;
  if ck is not null and ck::text <> new.kind::text then
    raise exception 'That category is for %', ck using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_transaction_category() from public, anon, authenticated;
create trigger check_transaction_category before insert or update of category_id, kind on public.transactions
  for each row execute function public.check_transaction_category();

-- Budget lines only cover expense categories.
create or replace function public.check_budget_line_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.transaction_categories c where c.id = new.category_id and c.kind <> 'expense') then
    raise exception 'Budgets cover expense categories' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_budget_line_category() from public, anon, authenticated;
create trigger check_budget_line_category before insert or update of category_id on public.budget_lines
  for each row execute function public.check_budget_line_category();

-- Lets other rows reference a savings goal with the usual (id, user_id) pair.
alter table public.savings_goals add constraint savings_goals_id_user_key unique (id, user_id);

-- Bills must be outgoing, income schedules incoming: the sign carries meaning.
alter table public.recurring_transactions add constraint recurring_bill_sign check (not (is_bill or is_subscription) or amount < 0);

create index exchange_rates_lookup_idx on public.exchange_rates (user_id, base, quote, as_of desc);
create index budgets_user_idx on public.budgets (user_id) where archived_at is null;
