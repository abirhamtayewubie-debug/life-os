-- Phase 7: notifications on your devices, calendar files and feeds, and
-- health imports. Nothing here connects to an outside account by itself.

-- ---------------------------------------------------------------------------
-- Web push: one row per browser or phone that turned notifications on.
-- The keys are the browser's public encryption keys for this subscription;
-- they can only be used to send to that device, not to read anything.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  -- Browsers always give https endpoints; plain http only for a local test push service.
  endpoint         text not null unique check ((endpoint ~ '^https://' or endpoint ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/') and char_length(endpoint) <= 1000),
  p256dh           text not null check (char_length(p256dh) between 40 and 200),
  auth             text not null check (char_length(auth) between 10 and 100),
  label            text check (char_length(label) <= 120),
  last_success_at  timestamptz,
  failure_count    smallint not null default 0 check (failure_count >= 0),
  source           public.data_source not null default 'manual',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
select private.apply_owner_policies('public.push_subscriptions');

-- Deliveries are retried with backoff; the sender claims an attempt by
-- moving next_attempt_at forward, so two senders never send the same one.
alter table public.reminder_deliveries add column next_attempt_at timestamptz;
create index reminder_deliveries_retry_idx on public.reminder_deliveries (next_attempt_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Imported workouts are matched on their outside id, so importing the same
-- file twice adds nothing (calendar events already have
-- calendar_events_external_key from 0002).
-- ---------------------------------------------------------------------------

alter table public.workouts add column external_id text check (char_length(external_id) <= 300);
create unique index workouts_external_key on public.workouts (user_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- Private calendar feed: a secret link a calendar app can subscribe to.
-- Only a hash of the token is stored; the link is shown once when created.
-- ---------------------------------------------------------------------------
create table public.calendar_feeds (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  token_hash  bytea not null unique check (octet_length(token_hash) = 32),
  last_used_at timestamptz,
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select private.apply_owner_policies('public.calendar_feeds');

-- What a calendar app sees through the feed: event times and text only, for
-- the one person whose token matches. Callable without signing in, because
-- calendar apps can't sign in; the 256-bit token is the credential.
create or replace function public.calendar_feed(feed_token text)
returns table (
  id uuid, title text, description text, location text, all_day boolean,
  starts_at timestamptz, ends_at timestamptz, timezone text, recurrence_rule text, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  owner uuid;
begin
  if feed_token is null or feed_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;
  select f.user_id into owner from public.calendar_feeds f
  where f.token_hash = extensions.digest(feed_token, 'sha256');
  if owner is null then
    return;
  end if;
  return query
    select e.id, e.title, e.description, e.location, e.all_day, e.starts_at, e.ends_at, e.timezone, e.recurrence_rule, e.updated_at
    from public.calendar_events e
    where e.user_id = owner and e.archived_at is null
      and (e.recurrence_rule is not null or e.ends_at >= now() - interval '90 days')
    order by e.starts_at
    limit 2000;
end;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- Says whether a feed link is live, and records when it was last read
-- (separate so calendar_feed stays `stable`).
create or replace function public.touch_calendar_feed(feed_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  h bytea;
begin
  if feed_token is null or feed_token !~ '^[A-Za-z0-9_-]{43}$' then
    return false;
  end if;
  h := extensions.digest(feed_token, 'sha256');
  update public.calendar_feeds set last_used_at = now()
  where token_hash = h and (last_used_at is null or last_used_at < now() - interval '10 minutes');
  return exists (select 1 from public.calendar_feeds where token_hash = h);
end;
$$;
revoke all on function public.touch_calendar_feed(text) from public;
grant execute on function public.touch_calendar_feed(text) to anon, authenticated;
