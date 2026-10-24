-- Life OS · 0015 · Google Calendar two-way sync
-- Tokens live in integration_credentials (0006), encrypted by the server and
-- readable only with the secret key. The rest is bookkeeping so each side
-- only sends what changed.

-- Google's "give me what changed since last time" token for the primary calendar.
alter table public.integrations add column sync_cursor text check (char_length(sync_cursor) <= 2000);

-- An event needs sending to Google when it changed after it was last synced.
-- synced_at is always stamped with the transaction time (the same clock
-- updated_at uses), so a sync write leaves the two equal.
alter table public.calendar_events add column synced_at timestamptz;
alter table public.calendar_events add column needs_push boolean
  generated always as (synced_at is null or updated_at > synced_at) stored;

create or replace function private.stamp_synced_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.synced_at is not null and (tg_op = 'INSERT' or new.synced_at is distinct from old.synced_at) then
    new.synced_at := now();
  end if;
  return new;
end;
$$;
create trigger stamp_synced_at before insert or update on public.calendar_events
  for each row execute function private.stamp_synced_at();

create index calendar_events_needs_push_idx on public.calendar_events (user_id) where needs_push and archived_at is null;

-- Events deleted in Life OS that still exist in Google, waiting to be removed
-- there. Written only by the trigger below and read by the server sync, so no
-- policies: signed-in users can't see or change it. No foreign key, so that
-- deleting an account (which cascades to events) never trips over it; the
-- trigger skips rows once the account is gone.
create table public.calendar_sync_deletions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  provider     text not null check (char_length(provider) <= 40),
  external_id  text not null check (char_length(external_id) <= 300),
  created_at   timestamptz not null default now()
);
create index calendar_sync_deletions_user_idx on public.calendar_sync_deletions (user_id, provider);
alter table public.calendar_sync_deletions enable row level security;
alter table public.calendar_sync_deletions force row level security;
revoke all on public.calendar_sync_deletions from anon, authenticated;

create or replace function private.remember_synced_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.external_provider = 'google'
     and exists (select 1 from auth.users u where u.id = old.user_id)
     and exists (select 1 from public.integrations i
                 where i.user_id = old.user_id and i.provider = 'google_calendar' and i.status in ('connected', 'error')) then
    insert into public.calendar_sync_deletions (user_id, provider, external_id)
    values (old.user_id, 'google', old.external_id);
  end if;
  return old;
end;
$$;
create trigger remember_synced_deletion after delete on public.calendar_events
  for each row execute function private.remember_synced_deletion();

-- Removing the connection row (as deleting an account does) drops anything
-- still queued for it.
create or replace function private.forget_synced_deletions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.provider = 'google_calendar' then
    delete from public.calendar_sync_deletions where user_id = old.user_id and provider = 'google';
  end if;
  return old;
end;
$$;
create trigger forget_synced_deletions after delete on public.integrations
  for each row execute function private.forget_synced_deletions();
