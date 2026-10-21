-- Life OS · 0003 · Life & reflection
-- Wheel of Life assessments, daily morning/evening reviews, journal entries
-- (private by default), notes / knowledge base with full-text search,
-- people and important dates, learning resources.

-- ---------------------------------------------------------------------------
-- Wheel of Life assessments (subjective 1–10 ratings; no overall score)
-- ---------------------------------------------------------------------------
create table public.wheel_assessments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  assessed_on  date not null,
  note         text check (char_length(note) <= 5000),
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create index wheel_assessments_user_date_idx on public.wheel_assessments (user_id, assessed_on desc);
select private.apply_owner_policies('public.wheel_assessments');

create table public.wheel_ratings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  assessment_id  uuid not null,
  category_id    uuid not null,
  score          smallint not null check (score between 1 and 10),
  desired_score  smallint check (desired_score between 1 and 10),
  note           text check (char_length(note) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assessment_id, category_id),
  foreign key (assessment_id, user_id) references public.wheel_assessments (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.wheel_categories (id, user_id) on delete cascade
);
create index wheel_ratings_category_idx on public.wheel_ratings (category_id);
select private.apply_owner_policies('public.wheel_ratings');

-- ---------------------------------------------------------------------------
-- Daily reviews: morning briefing acknowledgement and evening review
-- ---------------------------------------------------------------------------
create type public.review_kind as enum ('morning', 'evening', 'weekly');

create table public.daily_reviews (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  review_date          date not null,
  kind                 public.review_kind not null,
  achievements         text check (char_length(achievements) <= 5000),
  unfinished           text check (char_length(unfinished) <= 5000),
  tomorrow_priorities  text[] not null default '{}' check (cardinality(tomorrow_priorities) <= 10),
  mood                 smallint check (mood between 1 and 5),
  energy               smallint check (energy between 1 and 5),
  notes                text check (char_length(notes) <= 5000),
  source               public.data_source not null default 'manual',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, review_date, kind)
);
select private.apply_owner_policies('public.daily_reviews');

-- ---------------------------------------------------------------------------
-- Journal (private by default; AI access is an explicit per-entry opt-in)
-- ---------------------------------------------------------------------------
create type public.journal_kind as enum ('journal', 'gratitude', 'reflection', 'prayer', 'meditation', 'intention');

create table public.journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  entry_date         date not null,
  kind               public.journal_kind not null default 'journal',
  title              text check (char_length(title) <= 200),
  body               text not null check (char_length(body) <= 50000),
  mood               smallint check (mood between 1 and 5),
  is_private         boolean not null default true,
  ai_access_allowed  boolean not null default false,
  source             public.data_source not null default 'manual',
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  check (not (is_private and ai_access_allowed))
);
create index journal_entries_user_date_idx on public.journal_entries (user_id, entry_date desc) where archived_at is null;
select private.apply_owner_policies('public.journal_entries');

-- ---------------------------------------------------------------------------
-- Notes / personal knowledge base
-- ---------------------------------------------------------------------------
create type public.note_kind as enum ('note', 'idea', 'meeting', 'learning', 'decision', 'reference', 'record');

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid,
  goal_id     uuid,
  kind        public.note_kind not null default 'note',
  title       text not null check (char_length(title) between 1 and 300),
  body        text not null default '' check (char_length(body) <= 100000),
  folder      text check (char_length(folder) <= 120),
  url         text check (url ~ '^https?://' and char_length(url) <= 2000),
  pinned      boolean not null default false,
  source      public.data_source not null default 'manual',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (
                setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(body, '')), 'B')
              ) stored,
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index notes_search_idx on public.notes using gin (search);
create index notes_user_updated_idx on public.notes (user_id, updated_at desc) where archived_at is null;
create index notes_project_idx on public.notes (project_id);
create index notes_goal_idx on public.notes (goal_id);
select private.apply_owner_policies('public.notes');

create table public.note_tags (
  user_id     uuid not null references auth.users (id) on delete cascade,
  note_id     uuid not null,
  tag_id      uuid not null,
  created_at  timestamptz not null default now(),
  primary key (note_id, tag_id),
  foreign key (note_id, user_id) references public.notes (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);
create index note_tags_tag_idx on public.note_tags (tag_id);
select private.apply_owner_policies('public.note_tags');

-- ---------------------------------------------------------------------------
-- Relationships and important dates
-- ---------------------------------------------------------------------------
create table public.people (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 120),
  relationship          text check (char_length(relationship) <= 60),
  birthday              date,
  notes                 text check (char_length(notes) <= 10000), -- private
  contact_every_days    smallint check (contact_every_days between 1 and 365),
  last_contacted_on     date,
  source                public.data_source not null default 'manual',
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, user_id)
);
create index people_user_idx on public.people (user_id) where archived_at is null;
select private.apply_owner_policies('public.people');

create type public.important_date_kind as enum ('birthday', 'anniversary', 'memorial', 'renewal', 'other');

create table public.important_dates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  person_id           uuid,
  kind                public.important_date_kind not null default 'other',
  title               text not null check (char_length(title) between 1 and 200),
  date                date not null,
  recurs_yearly       boolean not null default true,
  remind_days_before  smallint not null default 3 check (remind_days_before between 0 and 60),
  source              public.data_source not null default 'manual',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (person_id, user_id) references public.people (id, user_id) on delete cascade
);
create index important_dates_user_idx on public.important_dates (user_id, date);
create index important_dates_person_idx on public.important_dates (person_id);
select private.apply_owner_policies('public.important_dates');

-- ---------------------------------------------------------------------------
-- Learning: courses, books, skills
-- ---------------------------------------------------------------------------
create type public.learning_kind as enum ('book', 'course', 'article', 'video', 'podcast', 'practice');
create type public.learning_status as enum ('planned', 'in_progress', 'completed', 'dropped');

create table public.learning_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  goal_id       uuid,
  kind          public.learning_kind not null,
  title         text not null check (char_length(title) between 1 and 300),
  author        text check (char_length(author) <= 200),
  url           text check (url ~ '^https?://' and char_length(url) <= 2000),
  status        public.learning_status not null default 'planned',
  progress_pct  smallint check (progress_pct between 0 and 100),
  started_on    date,
  finished_on   date,
  source        public.data_source not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index learning_items_user_idx on public.learning_items (user_id, status);
create index learning_items_goal_idx on public.learning_items (goal_id);
select private.apply_owner_policies('public.learning_items');

create table public.skills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  area          public.life_area not null default 'learning',
  level         smallint check (level between 1 and 5),
  target_level  smallint check (target_level between 1 and 5),
  notes         text check (char_length(notes) <= 5000),
  source        public.data_source not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index skills_user_name_key on public.skills (user_id, lower(name));
select private.apply_owner_policies('public.skills');
