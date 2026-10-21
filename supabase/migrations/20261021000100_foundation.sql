-- Life OS · 0001 · Foundation
-- Profiles, preferences, module + dashboard configuration, audit trail, tags,
-- generic record links, provenance enum, and the helpers every later
-- migration uses to apply owner-only Row Level Security.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Provenance: every user-owned record says where it came from.
-- ---------------------------------------------------------------------------
create type public.data_source as enum (
  'manual',        -- typed in by the user
  'imported',      -- CSV / file import
  'device',        -- wearable or OS health platform
  'integration',   -- external API (calendar, bank aggregator …)
  'estimate',      -- derived / projected, not measured
  'ai_suggested',  -- proposed by the assistant and confirmed by the user
  'sample'         -- demo data; removable with public.purge_sample_data()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Applies the standard owner-only policy set and updated_at trigger.
-- Policies use (select auth.uid()) so the planner evaluates it once per query.
create or replace function private.apply_owner_policies(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  has_updated_at boolean;
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format(
    'create policy owner_select on %s for select to authenticated using (user_id = (select auth.uid()))', tbl);
  execute format(
    'create policy owner_insert on %s for insert to authenticated with check (user_id = (select auth.uid()))', tbl);
  execute format(
    'create policy owner_update on %s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', tbl);
  execute format(
    'create policy owner_delete on %s for delete to authenticated using (user_id = (select auth.uid()))', tbl);

  select exists (
    select 1 from pg_attribute
    where attrelid = tbl and attname = 'updated_at' and not attisdropped
  ) into has_updated_at;

  if has_updated_at then
    execute format(
      'create trigger set_updated_at before update on %s for each row execute function private.set_updated_at()', tbl);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text check (char_length(display_name) <= 80),
  timezone        text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  locale          text not null default 'en-US' check (char_length(locale) between 2 and 35),
  base_currency   char(3) not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  week_starts_on  smallint not null default 1 check (week_starts_on between 0 and 6),
  theme           text not null default 'system' check (theme in ('system', 'light', 'dark')),
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
create policy profile_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Inserts happen only through the auth trigger below; deletes cascade from auth.users.
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Module visibility and dashboard layout
-- ---------------------------------------------------------------------------
create table public.module_settings (
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_key  text not null check (module_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  enabled     boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, module_key)
);
select private.apply_owner_policies('public.module_settings');

create type public.widget_size as enum ('sm', 'md', 'lg', 'full');

create table public.dashboard_widgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  widget_key  text not null check (widget_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  sort_order  integer not null default 0,
  size        public.widget_size not null default 'md',
  visible     boolean not null default true,
  settings    jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, widget_key)
);
select private.apply_owner_policies('public.dashboard_widgets');

-- ---------------------------------------------------------------------------
-- Audit trail (append-only from the user's point of view)
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  action       text not null check (char_length(action) <= 80),
  entity_type  text check (char_length(entity_type) <= 60),
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;
create policy audit_select on public.audit_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy audit_insert on public.audit_events for insert to authenticated
  with check (user_id = (select auth.uid()));
-- No update/delete policies: entries cannot be altered by the user session.

-- ---------------------------------------------------------------------------
-- Tags and generic links (knowledge-base backlinks, related records)
-- ---------------------------------------------------------------------------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text check (color ~ '^[a-z]+$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create unique index tags_user_name_key on public.tags (user_id, lower(name));
select private.apply_owner_policies('public.tags');

create type public.record_type as enum (
  'goal', 'project', 'task', 'event', 'habit', 'note', 'journal_entry',
  'person', 'transaction', 'wheel_category'
);

create table public.record_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  from_type   public.record_type not null,
  from_id     uuid not null,
  to_type     public.record_type not null,
  to_id       uuid not null,
  created_at  timestamptz not null default now(),
  unique (user_id, from_type, from_id, to_type, to_id),
  check (not (from_type = to_type and from_id = to_id))
);
create index record_links_to_idx on public.record_links (user_id, to_type, to_id);
select private.apply_owner_policies('public.record_links');
