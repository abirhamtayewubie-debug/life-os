-- Life OS · 0006 · AI assistant, integrations, reports, data controls
-- The assistant never gets database credentials: tools run through the app
-- with the user's own RLS-scoped session. Write proposals wait for explicit
-- confirmation in ai_tool_calls.

-- ---------------------------------------------------------------------------
-- AI preferences (off by default; per-module data access opt-in)
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  enabled                  boolean not null default false,
  allowed_modules          text[] not null default '{}',
  include_private_journal  boolean not null default false,
  include_health           boolean not null default false,
  include_finance          boolean not null default false,
  retain_conversations_days smallint not null default 90 check (retain_conversations_days between 0 and 3650),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
select private.apply_owner_policies('public.ai_settings');

create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text check (char_length(title) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
select private.apply_owner_policies('public.ai_conversations');

create type public.ai_role as enum ('user', 'assistant');

create table public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  conversation_id  uuid not null,
  role             public.ai_role not null,
  content          jsonb not null,           -- content blocks as returned/sent
  model            text check (char_length(model) <= 80),
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
select private.apply_owner_policies('public.ai_messages');

create type public.ai_tool_status as enum ('completed', 'failed', 'denied', 'pending_confirmation', 'confirmed', 'rejected', 'expired');

create table public.ai_tool_calls (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  conversation_id        uuid not null,
  message_id             uuid,
  tool_name              text not null check (tool_name ~ '^[a-z][a-z0-9_]{1,60}$'),
  input                  jsonb not null,
  status                 public.ai_tool_status not null,
  requires_confirmation  boolean not null default false,
  result_summary         text check (char_length(result_summary) <= 2000),
  records_read           integer,
  error                  text check (char_length(error) <= 1000),
  decided_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check (not requires_confirmation or status in ('pending_confirmation', 'confirmed', 'rejected', 'expired', 'failed')),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade,
  foreign key (message_id, user_id) references public.ai_messages (id, user_id) on delete set null (message_id)
);
create index ai_tool_calls_conversation_idx on public.ai_tool_calls (conversation_id, created_at);
create index ai_tool_calls_pending_idx on public.ai_tool_calls (user_id) where status = 'pending_confirmation';
create index ai_tool_calls_message_idx on public.ai_tool_calls (message_id);
select private.apply_owner_policies('public.ai_tool_calls');

-- ---------------------------------------------------------------------------
-- Integrations: status is user-visible; tokens are NOT.
-- ---------------------------------------------------------------------------
create type public.integration_status as enum ('connected', 'error', 'revoked', 'disconnected');

create table public.integrations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  provider         text not null check (provider ~ '^[a-z][a-z0-9_]{1,40}$'),
  status           public.integration_status not null default 'disconnected',
  scopes           text[] not null default '{}',
  account_label    text check (char_length(account_label) <= 200),
  connected_at     timestamptz,
  last_synced_at   timestamptz,
  last_error       text check (char_length(last_error) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider)
);
select private.apply_owner_policies('public.integrations');

-- OAuth tokens live in a table with RLS enabled and NO policies for
-- anon/authenticated: only server code using the service role can read them.
-- (Phase 7 will move the secret values into Supabase Vault.)
create table public.integration_credentials (
  integration_id   uuid primary key references public.integrations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  access_token_encrypted   bytea,
  refresh_token_encrypted  bytea,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.integration_credentials enable row level security;
alter table public.integration_credentials force row level security;
revoke all on public.integration_credentials from anon, authenticated;
create trigger set_updated_at before update on public.integration_credentials
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reports (stored snapshots so history doesn't change when data is edited)
-- ---------------------------------------------------------------------------
create type public.report_period as enum ('daily', 'weekly', 'monthly', 'quarterly', 'annual');

create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  period         public.report_period not null,
  period_start   date not null,
  period_end     date not null,
  measured       jsonb not null,           -- computed facts only
  interpretation text check (char_length(interpretation) <= 20000), -- AI text, labelled as such
  generated_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start),
  unique (user_id, period, period_start)
);
select private.apply_owner_policies('public.reports');

-- ---------------------------------------------------------------------------
-- Data controls
-- ---------------------------------------------------------------------------
-- Deletes every row the CALLER owns that is marked source = 'sample'.
-- security invoker: RLS still applies, so a user can only purge their own rows.
create or replace function public.purge_sample_data()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t record;
  n integer;
  total integer := 0;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Children first is not required: FKs cascade or set null.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.columns u
      on u.table_schema = c.table_schema and u.table_name = c.table_name and u.column_name = 'user_id'
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'source' and c.udt_name = 'data_source'
    order by c.table_name
  loop
    execute format('delete from public.%I where user_id = $1 and source = ''sample''', t.table_name) using uid;
    get diagnostics n = row_count;
    total := total + n;
  end loop;

  insert into public.audit_events (user_id, action, metadata)
  values (uid, 'sample_data.purged', jsonb_build_object('rows', total));

  return total;
end;
$$;

revoke execute on function public.purge_sample_data() from public, anon;
grant execute on function public.purge_sample_data() to authenticated;
