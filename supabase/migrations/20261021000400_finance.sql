-- Life OS · 0004 · Personal finance
-- Amounts are numeric(19,4) and ALWAYS paired with an explicit ISO-4217
-- currency. Different currencies are never summed in SQL; conversions require
-- an exchange_rates row with an as_of date.
--
-- Sign convention for transactions: positive = money into the account,
-- negative = money out. kind adds meaning (income / expense / transfer /
-- adjustment) and is checked against the sign.

create table public.currencies (
  code        char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name        text not null,
  minor_units smallint not null check (minor_units between 0 and 4),
  symbol      text
);
alter table public.currencies enable row level security;
create policy currencies_read on public.currencies for select to anon, authenticated using (true);

insert into public.currencies (code, name, minor_units, symbol) values
  ('ETB', 'Ethiopian Birr', 2, 'Br'),
  ('USD', 'US Dollar', 2, '$'),
  ('CAD', 'Canadian Dollar', 2, 'CA$'),
  ('EUR', 'Euro', 2, '€'),
  ('GBP', 'Pound Sterling', 2, '£'),
  ('KES', 'Kenyan Shilling', 2, 'KSh'),
  ('AED', 'UAE Dirham', 2, 'AED')
on conflict (code) do nothing;

create table public.exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  base        char(3) not null references public.currencies (code),
  quote       char(3) not null references public.currencies (code),
  rate        numeric(24, 10) not null check (rate > 0),  -- 1 base = rate quote
  as_of       date not null,
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (base <> quote),
  unique (user_id, base, quote, as_of)
);
select private.apply_owner_policies('public.exchange_rates');

-- ---------------------------------------------------------------------------
-- Accounts (cash wallets, bank, cards, loans, investments)
-- ---------------------------------------------------------------------------
create type public.account_kind as enum ('cash', 'checking', 'savings', 'credit_card', 'loan', 'investment', 'mobile_money', 'other');

create table public.financial_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  kind             public.account_kind not null,
  currency         char(3) not null references public.currencies (code),
  institution      text check (char_length(institution) <= 120),
  opening_balance  numeric(19, 4) not null default 0,
  opening_date     date not null default current_date,
  is_liability     boolean generated always as (kind in ('credit_card', 'loan')) stored,
  interest_rate    numeric(7, 4) check (interest_rate is null or interest_rate between 0 and 100),
  include_in_net_worth boolean not null default true,
  source           public.data_source not null default 'manual',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  -- lets transactions prove their currency matches the account
  unique (id, user_id, currency)
);
create index financial_accounts_user_idx on public.financial_accounts (user_id) where archived_at is null;
select private.apply_owner_policies('public.financial_accounts');

create type public.category_kind as enum ('income', 'expense');

create table public.transaction_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  parent_id   uuid,
  kind        public.category_kind not null,
  name        text not null check (char_length(name) between 1 and 80),
  color       text check (color ~ '^[a-z]+$'),
  source      public.data_source not null default 'manual',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check (parent_id is null or parent_id <> id),
  foreign key (parent_id, user_id) references public.transaction_categories (id, user_id) on delete cascade
);
create unique index transaction_categories_name_key
  on public.transaction_categories (user_id, kind, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
select private.apply_owner_policies('public.transaction_categories');

create type public.recurrence_unit as enum ('week', 'month', 'year');

create table public.recurring_transactions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  account_id            uuid not null,
  category_id           uuid,
  currency              char(3) not null,
  description           text not null check (char_length(description) between 1 and 200),
  amount                numeric(19, 4) not null check (amount <> 0),
  every_n               smallint not null default 1 check (every_n between 1 and 24),
  unit                  public.recurrence_unit not null default 'month',
  next_due_on           date not null,
  ends_on               date,
  is_subscription       boolean not null default false,
  is_bill               boolean not null default false,
  remind_days_before    smallint not null default 2 check (remind_days_before between 0 and 30),
  autopay               boolean not null default false, -- informational only; we never move money
  source                public.data_source not null default 'manual',
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id, currency) references public.financial_accounts (id, user_id, currency) on delete cascade,
  foreign key (category_id, user_id) references public.transaction_categories (id, user_id) on delete set null (category_id)
);
create index recurring_transactions_due_idx on public.recurring_transactions (user_id, next_due_on) where archived_at is null;
create index recurring_transactions_account_idx on public.recurring_transactions (account_id);
create index recurring_transactions_category_idx on public.recurring_transactions (category_id);
select private.apply_owner_policies('public.recurring_transactions');

create type public.transaction_kind as enum ('income', 'expense', 'transfer', 'adjustment');

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  account_id         uuid not null,
  category_id        uuid,
  recurring_id       uuid,
  project_id         uuid,
  kind               public.transaction_kind not null,
  amount             numeric(19, 4) not null check (amount <> 0),
  currency           char(3) not null,
  occurred_on        date not null,
  description        text check (char_length(description) <= 300),
  payee              text check (char_length(payee) <= 200),
  notes              text check (char_length(notes) <= 2000),
  -- both legs of a transfer share a group id
  transfer_group_id  uuid,
  is_pending         boolean not null default false,
  external_id        text check (char_length(external_id) <= 200),
  source             public.data_source not null default 'manual',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (
    (kind = 'income' and amount > 0) or
    (kind = 'expense' and amount < 0) or
    (kind = 'transfer' and transfer_group_id is not null) or
    (kind = 'adjustment')
  ),
  check (kind = 'transfer' or transfer_group_id is null),
  foreign key (account_id, user_id, currency) references public.financial_accounts (id, user_id, currency) on delete cascade,
  foreign key (category_id, user_id) references public.transaction_categories (id, user_id) on delete set null (category_id),
  foreign key (recurring_id, user_id) references public.recurring_transactions (id, user_id) on delete set null (recurring_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_date_idx on public.transactions (account_id, occurred_on desc);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_recurring_idx on public.transactions (recurring_id);
create index transactions_project_idx on public.transactions (project_id);
create index transactions_transfer_idx on public.transactions (transfer_group_id) where transfer_group_id is not null;
create unique index transactions_external_key on public.transactions (account_id, external_id) where external_id is not null;
select private.apply_owner_policies('public.transactions');

-- Point-in-time valuations (investments, imported statements) for net-worth history.
create table public.account_balance_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid not null,
  currency    char(3) not null,
  as_of       date not null,
  balance     numeric(19, 4) not null,
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, as_of),
  foreign key (account_id, user_id, currency) references public.financial_accounts (id, user_id, currency) on delete cascade
);
select private.apply_owner_policies('public.account_balance_snapshots');

-- Ledger balance per account (opening balance + posted transactions), in the
-- account's own currency. security_invoker makes the caller's RLS apply.
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.kind,
  a.currency,
  a.is_liability,
  a.opening_balance + coalesce(sum(t.amount) filter (where not t.is_pending), 0) as balance,
  max(t.occurred_on) as last_transaction_on
from public.financial_accounts a
left join public.transactions t on t.account_id = a.id
where a.archived_at is null
group by a.id;

-- ---------------------------------------------------------------------------
-- Budgets
-- ---------------------------------------------------------------------------
create type public.budget_period as enum ('weekly', 'monthly');

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  period      public.budget_period not null default 'monthly',
  currency    char(3) not null references public.currencies (code),
  starts_on   date not null,
  ends_on     date,
  source      public.data_source not null default 'manual',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on is null or ends_on >= starts_on)
);
select private.apply_owner_policies('public.budgets');

create table public.budget_lines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  budget_id    uuid not null,
  category_id  uuid not null,
  amount       numeric(19, 4) not null check (amount >= 0),  -- per period, in budget currency
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (budget_id, category_id),
  foreign key (budget_id, user_id) references public.budgets (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.transaction_categories (id, user_id) on delete cascade
);
create index budget_lines_category_idx on public.budget_lines (category_id);
select private.apply_owner_policies('public.budget_lines');

-- ---------------------------------------------------------------------------
-- Savings goals and debts
-- ---------------------------------------------------------------------------
create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  goal_id        uuid,
  account_id     uuid,
  name           text not null check (char_length(name) between 1 and 120),
  target_amount  numeric(19, 4) not null check (target_amount > 0),
  currency       char(3) not null references public.currencies (code),
  saved_amount   numeric(19, 4) not null default 0 check (saved_amount >= 0),
  target_date    date,
  source         public.data_source not null default 'manual',
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id),
  foreign key (account_id, user_id) references public.financial_accounts (id, user_id) on delete set null (account_id)
);
create index savings_goals_goal_idx on public.savings_goals (goal_id);
create index savings_goals_account_idx on public.savings_goals (account_id);
select private.apply_owner_policies('public.savings_goals');
