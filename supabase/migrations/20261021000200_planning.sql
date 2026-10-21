-- Life OS · 0002 · Planning core
-- Wheel of Life categories (referenced by goals), goals hierarchy, milestones,
-- projects, tasks, dependencies, calendar events, reminders + deliveries,
-- habits + logs.
--
-- Cross-row references use composite (id, user_id) foreign keys so a record
-- can never point at another user's record. ON DELETE SET NULL (col) keeps
-- user_id intact when only the reference is cleared (Postgres 15+).

-- ---------------------------------------------------------------------------
-- Wheel of Life categories (assessments live in 0003)
-- ---------------------------------------------------------------------------
create table public.wheel_categories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  description  text check (char_length(description) <= 500),
  sort_order   integer not null default 0,
  source       public.data_source not null default 'manual',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);
create unique index wheel_categories_user_name_key
  on public.wheel_categories (user_id, lower(name)) where archived_at is null;
select private.apply_owner_policies('public.wheel_categories');

-- ---------------------------------------------------------------------------
-- Goals: vision → long-term → annual → quarterly (projects/tasks hang below)
-- ---------------------------------------------------------------------------
create type public.goal_level as enum ('vision', 'long_term', 'annual', 'quarterly');
create type public.goal_status as enum ('active', 'paused', 'completed', 'abandoned');

create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  parent_id          uuid,
  wheel_category_id  uuid,
  level              public.goal_level not null,
  title              text not null check (char_length(title) between 1 and 200),
  description        text check (char_length(description) <= 5000),
  why                text check (char_length(why) <= 2000),
  status             public.goal_status not null default 'active',
  target_date        date,
  metric_label       text check (char_length(metric_label) <= 60),
  metric_target      numeric(19, 4),
  metric_current     numeric(19, 4),
  completed_at       timestamptz,
  source             public.data_source not null default 'manual',
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  check (parent_id is null or parent_id <> id),
  check ((status = 'completed') = (completed_at is not null)),
  foreign key (parent_id, user_id) references public.goals (id, user_id) on delete set null (parent_id),
  foreign key (wheel_category_id, user_id) references public.wheel_categories (id, user_id) on delete set null (wheel_category_id)
);
create index goals_user_status_idx on public.goals (user_id, status) where archived_at is null;
create index goals_parent_idx on public.goals (parent_id);
create index goals_wheel_idx on public.goals (wheel_category_id);
select private.apply_owner_policies('public.goals');

create table public.goal_progress_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  goal_id      uuid not null,
  value        numeric(19, 4) not null,
  note         text check (char_length(note) <= 1000),
  recorded_at  timestamptz not null default now(),
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index goal_progress_goal_idx on public.goal_progress_entries (goal_id, recorded_at desc);
select private.apply_owner_policies('public.goal_progress_entries');

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create type public.project_status as enum ('planned', 'active', 'on_hold', 'completed', 'cancelled');
create type public.life_area as enum ('personal', 'work', 'family', 'health', 'finance', 'learning', 'home', 'spiritual', 'community');

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  goal_id          uuid,
  name             text not null check (char_length(name) between 1 and 160),
  description      text check (char_length(description) <= 5000),
  status           public.project_status not null default 'active',
  area             public.life_area not null default 'personal',
  start_date       date,
  due_date         date,
  budget_amount    numeric(19, 4) check (budget_amount is null or budget_amount >= 0),
  budget_currency  char(3) check (budget_currency ~ '^[A-Z]{3}$'),
  source           public.data_source not null default 'manual',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  check (due_date is null or start_date is null or due_date >= start_date),
  check ((budget_amount is null) = (budget_currency is null)),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index projects_user_status_idx on public.projects (user_id, status) where archived_at is null;
create index projects_goal_idx on public.projects (goal_id);
select private.apply_owner_policies('public.projects');

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid,
  goal_id       uuid,
  title         text not null check (char_length(title) between 1 and 200),
  due_date      date,
  completed_at  timestamptz,
  sort_order    integer not null default 0,
  source        public.data_source not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (num_nonnulls(project_id, goal_id) = 1),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index milestones_project_idx on public.milestones (project_id);
create index milestones_goal_idx on public.milestones (goal_id);
select private.apply_owner_policies('public.milestones');

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done', 'cancelled');
-- 1 = urgent, 2 = high, 3 = normal, 4 = low
create domain public.task_priority as smallint check (value between 1 and 4);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  project_id        uuid,
  goal_id           uuid,
  parent_task_id    uuid,
  title             text not null check (char_length(title) between 1 and 300),
  notes             text check (char_length(notes) <= 10000),
  status            public.task_status not null default 'todo',
  priority          public.task_priority not null default 3,
  area              public.life_area not null default 'personal',
  -- A task is due either on a calendar date (all-day) or at an instant.
  due_date          date,
  due_at            timestamptz,
  estimate_minutes  integer check (estimate_minutes is null or estimate_minutes between 1 and 10080),
  is_top_priority   boolean not null default false,  -- "today's most important"
  recurrence_rule   text check (char_length(recurrence_rule) <= 500), -- RFC 5545 RRULE
  recurrence_tz     text check (char_length(recurrence_tz) <= 64),
  completed_at      timestamptz,
  sort_order        integer not null default 0,
  source            public.data_source not null default 'manual',
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  check (parent_task_id is null or parent_task_id <> id),
  check (num_nonnulls(due_date, due_at) <= 1),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id),
  foreign key (parent_task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index tasks_user_open_due_idx on public.tasks (user_id, status, due_date, due_at) where archived_at is null;
create index tasks_project_idx on public.tasks (project_id);
create index tasks_goal_idx on public.tasks (goal_id);
create index tasks_parent_idx on public.tasks (parent_task_id);
select private.apply_owner_policies('public.tasks');

create table public.task_tags (
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid not null,
  tag_id      uuid not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);
create index task_tags_tag_idx on public.task_tags (tag_id);
select private.apply_owner_policies('public.task_tags');

create table public.task_dependencies (
  user_id             uuid not null references auth.users (id) on delete cascade,
  task_id             uuid not null,
  depends_on_task_id  uuid not null,
  created_at          timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (depends_on_task_id, user_id) references public.tasks (id, user_id) on delete cascade
);
create index task_dependencies_depends_idx on public.task_dependencies (depends_on_task_id);
select private.apply_owner_policies('public.task_dependencies');

-- ---------------------------------------------------------------------------
-- Calendar events (incl. time blocks for tasks)
-- ---------------------------------------------------------------------------
create type public.event_kind as enum ('event', 'meeting', 'appointment', 'time_block', 'reminder_only');

create table public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  task_id          uuid,
  project_id       uuid,
  kind             public.event_kind not null default 'event',
  title            text not null check (char_length(title) between 1 and 300),
  description      text check (char_length(description) <= 10000),
  location         text check (char_length(location) <= 300),
  all_day          boolean not null default false,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  timezone         text not null default 'UTC' check (char_length(timezone) <= 64),
  recurrence_rule  text check (char_length(recurrence_rule) <= 500),
  external_provider text check (char_length(external_provider) <= 40),
  external_id      text check (char_length(external_id) <= 300),
  source           public.data_source not null default 'manual',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  check (ends_at >= starts_at),
  check ((external_provider is null) = (external_id is null)),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);
create index calendar_events_user_range_idx on public.calendar_events (user_id, starts_at, ends_at) where archived_at is null;
create unique index calendar_events_external_key on public.calendar_events (user_id, external_provider, external_id) where external_id is not null;
create index calendar_events_task_idx on public.calendar_events (task_id);
create index calendar_events_project_idx on public.calendar_events (project_id);
select private.apply_owner_policies('public.calendar_events');

-- ---------------------------------------------------------------------------
-- Reminders and delivery attempts
-- ---------------------------------------------------------------------------
create type public.reminder_status as enum ('scheduled', 'snoozed', 'delivered', 'completed', 'cancelled');
create type public.notification_channel as enum ('in_app', 'web_push', 'email');
create type public.delivery_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  task_id          uuid,
  event_id         uuid,
  title            text not null check (char_length(title) between 1 and 300),
  remind_at        timestamptz not null,
  timezone         text not null default 'UTC' check (char_length(timezone) <= 64),
  recurrence_rule  text check (char_length(recurrence_rule) <= 500),
  status           public.reminder_status not null default 'scheduled',
  snoozed_until    timestamptz,
  channels         public.notification_channel[] not null default array['in_app']::public.notification_channel[],
  completed_at     timestamptz,
  source           public.data_source not null default 'manual',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  check ((status = 'snoozed') = (snoozed_until is not null)),
  check (cardinality(channels) >= 1),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (event_id, user_id) references public.calendar_events (id, user_id) on delete cascade
);
create index reminders_due_idx on public.reminders (coalesce(snoozed_until, remind_at))
  where status in ('scheduled', 'snoozed');
create index reminders_user_idx on public.reminders (user_id, status, remind_at);
create index reminders_task_idx on public.reminders (task_id);
create index reminders_event_idx on public.reminders (event_id);
select private.apply_owner_policies('public.reminders');

create table public.reminder_deliveries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  reminder_id    uuid not null,
  channel        public.notification_channel not null,
  status         public.delivery_status not null default 'pending',
  scheduled_for  timestamptz not null,
  attempt        smallint not null default 0 check (attempt between 0 and 10),
  sent_at        timestamptz,
  read_at        timestamptz,
  error          text check (char_length(error) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (reminder_id, channel, scheduled_for),
  foreign key (reminder_id, user_id) references public.reminders (id, user_id) on delete cascade
);
create index reminder_deliveries_pending_idx on public.reminder_deliveries (scheduled_for) where status = 'pending';
create index reminder_deliveries_user_idx on public.reminder_deliveries (user_id, created_at desc);
select private.apply_owner_policies('public.reminder_deliveries');

-- ---------------------------------------------------------------------------
-- Habits and routines
-- ---------------------------------------------------------------------------
create type public.habit_cadence as enum ('daily', 'weekly');

create table public.habits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  goal_id            uuid,
  wheel_category_id  uuid,
  name               text not null check (char_length(name) between 1 and 120),
  description        text check (char_length(description) <= 2000),
  cadence            public.habit_cadence not null default 'daily',
  -- daily: which weekdays count (0 = Sunday). weekly: target times per week.
  schedule_days      smallint[] not null default array[0,1,2,3,4,5,6]::smallint[],
  target_per_period  smallint not null default 1 check (target_per_period between 1 and 50),
  time_of_day        text check (time_of_day in ('morning', 'afternoon', 'evening', 'anytime')),
  paused_at          timestamptz,
  source             public.data_source not null default 'manual',
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  check (schedule_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(schedule_days) >= 1),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id),
  foreign key (wheel_category_id, user_id) references public.wheel_categories (id, user_id) on delete set null (wheel_category_id)
);
create index habits_user_active_idx on public.habits (user_id) where archived_at is null;
create index habits_goal_idx on public.habits (goal_id);
create index habits_wheel_idx on public.habits (wheel_category_id);
select private.apply_owner_policies('public.habits');

create table public.habit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  habit_id    uuid not null,
  log_date    date not null,           -- the user's local date
  count       smallint not null default 1 check (count between 0 and 100),
  note        text check (char_length(note) <= 1000),
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, log_date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date desc);
select private.apply_owner_policies('public.habit_logs');
