-- Meditation library and practice log, and monthly reviews (additive; no existing row changes).
--
-- The library holds the guided meditations someone likes (usually YouTube
-- links) so they're one tap away; the log records each practice. Writing
-- about a practice stays in the journal (kind 'meditation'). Weekly and
-- monthly reviews reuse daily_reviews: one row per period, dated on the
-- period's first day.

alter type public.review_kind add value if not exists 'monthly';

create table public.meditation_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  url          text not null check (url ~ '^https://' and char_length(url) <= 2000),
  minutes      smallint check (minutes between 1 and 600),
  category     text check (char_length(category) <= 60),
  notes        text check (char_length(notes) <= 2000),
  favourite    boolean not null default false,
  archived_at  timestamptz,
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create index meditation_links_user_idx on public.meditation_links (user_id, archived_at);
select private.apply_owner_policies('public.meditation_links');

create table public.meditation_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  practiced_on  date not null,                       -- user's local date
  minutes       smallint not null check (minutes between 1 and 1440),
  link_id       uuid,
  notes         text check (char_length(notes) <= 2000),
  source        public.data_source not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (link_id, user_id) references public.meditation_links (id, user_id) on delete set null (link_id)
);
create index meditation_sessions_user_date_idx on public.meditation_sessions (user_id, practiced_on desc);
create index meditation_sessions_link_idx on public.meditation_sessions (link_id);
select private.apply_owner_policies('public.meditation_sessions');
