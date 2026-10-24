-- Personal loans: money borrowed from or lent to people (additive; no
-- existing row changes).
--
-- Each loan is backed by an ordinary account, so the ledger stays the one
-- source of truth: borrowing is a 'loan' account with a negative balance,
-- lending is an 'other' account with a positive balance (money owed to you).
-- Money changing hands is a transfer with your own account, or a balance
-- correction when it wasn't kept in a tracked account, so none of it counts
-- as income or spending. This table adds who, when it's due, and what it
-- started at.

create type public.loan_direction as enum ('borrowed', 'lent');

create table public.personal_loans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account_id   uuid not null unique,
  direction    public.loan_direction not null,
  person_name  text not null check (char_length(person_name) between 1 and 120),
  person_id    uuid,
  principal    numeric(19, 4) not null check (principal > 0),
  currency     char(3) not null,
  started_on   date not null,
  due_on       date,
  notes        text check (char_length(notes) <= 2000),
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  check (due_on is null or due_on >= started_on),
  -- deleting the account deletes the loan with it
  foreign key (account_id, user_id, currency) references public.financial_accounts (id, user_id, currency) on delete cascade,
  foreign key (person_id, user_id) references public.people (id, user_id) on delete set null (person_id)
);
create index personal_loans_user_idx on public.personal_loans (user_id, started_on desc);
create index personal_loans_person_idx on public.personal_loans (person_id);
select private.apply_owner_policies('public.personal_loans');

-- Creates the account, the loan and (when the money went through one of
-- your accounts) the opening transfer in one step.
create or replace function public.create_personal_loan(
  p_direction     public.loan_direction,
  p_person_name   text,
  p_person_id     uuid,
  p_amount        numeric,
  p_currency      char(3),
  p_started_on    date,
  p_due_on        date default null,
  p_interest_rate numeric default null,
  p_notes         text default null,
  p_via_account   uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  acc uuid;
  loan uuid;
  via_cur char(3);
  label text;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be positive' using errcode = '23514'; end if;
  if p_via_account is not null then
    select currency into via_cur from public.financial_accounts where id = p_via_account and archived_at is null;
    if via_cur is null then raise exception 'Account not found' using errcode = '23503'; end if;
    if via_cur <> p_currency then raise exception 'Pick an account in %', p_currency using errcode = '23514'; end if;
  end if;

  label := left(case p_direction when 'borrowed' then 'Borrowed from ' else 'Lent to ' end || btrim(p_person_name), 120);
  insert into public.financial_accounts (user_id, name, kind, currency, opening_balance, opening_date, interest_rate, source)
  values (
    uid, label, case p_direction when 'borrowed' then 'loan'::public.account_kind else 'other'::public.account_kind end, p_currency,
    case when p_via_account is not null then 0 when p_direction = 'borrowed' then -p_amount else p_amount end,
    p_started_on, p_interest_rate, 'manual'
  )
  returning id into acc;

  if p_via_account is not null then
    if p_direction = 'borrowed' then
      perform public.create_transfer(acc, p_via_account, p_amount, p_amount, p_started_on, label);
    else
      perform public.create_transfer(p_via_account, acc, p_amount, p_amount, p_started_on, label);
    end if;
  end if;

  insert into public.personal_loans (user_id, account_id, direction, person_name, person_id, principal, currency, started_on, due_on, notes, source)
  values (uid, acc, p_direction, btrim(p_person_name), p_person_id, p_amount, p_currency, p_started_on, p_due_on, p_notes, 'manual')
  returning id into loan;
  return loan;
end;
$$;
revoke execute on function public.create_personal_loan(public.loan_direction, text, uuid, numeric, char, date, date, numeric, text, uuid) from public, anon;
grant execute on function public.create_personal_loan(public.loan_direction, text, uuid, numeric, char, date, date, numeric, text, uuid) to authenticated;
