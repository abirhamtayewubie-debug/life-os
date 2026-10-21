-- Life OS · 0008 · Phase 3 goals and life areas
-- Time tracking, relationship contact log, home & admin items, personal
-- values, learning notes, goal-hierarchy rules, journal search and the
-- missing (id, user_id) keys that new links need.

-- ---------------------------------------------------------------------------
-- Goals: the hierarchy runs vision → long_term → annual → quarterly. A child
-- must sit at a lower level than its parent, and loops are refused.
-- ---------------------------------------------------------------------------
create or replace function private.goal_level_rank(l public.goal_level)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case l when 'vision' then 0 when 'long_term' then 1 when 'annual' then 2 else 3 end::smallint
$$;

create or replace function private.check_goal_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare parent_level public.goal_level;
begin
  if new.parent_id is null then return new; end if;
  select g.level into parent_level from public.goals g where g.id = new.parent_id;
  if parent_level is not null and private.goal_level_rank(parent_level) >= private.goal_level_rank(new.level) then
    raise exception 'A goal must sit under a broader goal' using errcode = '23514';
  end if;
  if exists (
    with recursive up(id) as (
      select g.parent_id from public.goals g where g.id = new.parent_id
      union
      select g.parent_id from public.goals g join up on g.id = up.id where g.parent_id is not null
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'A goal cannot sit under its own sub-goal' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_goal_parent before insert or update of parent_id, level on public.goals
  for each row execute function private.check_goal_parent();

-- Milestones are listed in order within their project or goal.
create index milestones_order_idx on public.milestones (coalesce(project_id, goal_id), sort_order);

-- ---------------------------------------------------------------------------
-- Work: time tracking against projects and tasks
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid,
  task_id     uuid,
  started_at  timestamptz not null,
  ended_at    timestamptz,               -- null while the timer runs
  note        text check (char_length(note) <= 1000),
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id)
);
create index time_entries_user_started_idx on public.time_entries (user_id, started_at desc);
create index time_entries_project_idx on public.time_entries (project_id);
create index time_entries_task_idx on public.time_entries (task_id);
-- At most one running timer per user.
create unique index time_entries_one_running_key on public.time_entries (user_id) where ended_at is null;
select private.apply_owner_policies('public.time_entries');

-- ---------------------------------------------------------------------------
-- Relationships: a simple log of contact, which keeps last_contacted_on honest
-- ---------------------------------------------------------------------------
create type public.interaction_kind as enum ('call', 'message', 'visit', 'meal', 'event', 'other');

create table public.interactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  person_id    uuid not null,
  occurred_on  date not null,
  kind         public.interaction_kind not null default 'other',
  note         text check (char_length(note) <= 2000), -- private
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (person_id, user_id) references public.people (id, user_id) on delete cascade
);
create index interactions_person_idx on public.interactions (person_id, occurred_on desc);
select private.apply_owner_policies('public.interactions');

-- last_contacted_on follows the newest interaction (insert, edit or delete).
create or replace function private.sync_last_contacted()
returns trigger
language plpgsql
set search_path = ''
as $$
declare pid uuid := coalesce(new.person_id, old.person_id);
begin
  update public.people p
     set last_contacted_on = (select max(i.occurred_on) from public.interactions i where i.person_id = pid)
   where p.id = pid;
  return null;
end;
$$;

create trigger sync_last_contacted after insert or update or delete on public.interactions
  for each row execute function private.sync_last_contacted();

-- ---------------------------------------------------------------------------
-- Home & admin: renewals, documents (as records of where things are), chores
-- ---------------------------------------------------------------------------
create type public.admin_kind as enum ('renewal', 'document', 'chore', 'record');

create table public.admin_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  kind                public.admin_kind not null,
  title               text not null check (char_length(title) between 1 and 200),
  category            text check (char_length(category) <= 60),   -- e.g. vehicle, home, identity
  due_on              date,                                       -- renewal/expiry or next chore date
  repeat_months       smallint check (repeat_months between 1 and 120),
  remind_days_before  smallint not null default 14 check (remind_days_before between 0 and 365),
  location            text check (char_length(location) <= 300),  -- where the paper/file is kept
  reference           text check (char_length(reference) <= 200), -- policy or document number (private)
  notes               text check (char_length(notes) <= 5000),
  completed_at        timestamptz,
  source              public.data_source not null default 'manual',
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  check (kind in ('document', 'record') or due_on is not null or completed_at is not null)
);
create index admin_items_user_due_idx on public.admin_items (user_id, due_on) where archived_at is null;
select private.apply_owner_policies('public.admin_items');

-- ---------------------------------------------------------------------------
-- Reflection: personal values the journal and goals can point back to
-- ---------------------------------------------------------------------------
create table public.personal_values (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  description  text check (char_length(description) <= 1000),
  sort_order   integer not null default 0,
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index personal_values_user_name_key on public.personal_values (user_id, lower(name));
select private.apply_owner_policies('public.personal_values');

-- Journal search (owner-only through RLS like everything else).
alter table public.journal_entries add column search tsvector generated always as (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(body, '')), 'B')
) stored;
create index journal_entries_search_idx on public.journal_entries using gin (search);

-- ---------------------------------------------------------------------------
-- Learning: notes on items; keep finished dates honest
-- ---------------------------------------------------------------------------
alter table public.learning_items add column notes text check (char_length(notes) <= 10000);
alter table public.learning_items add constraint learning_items_dates_check
  check (finished_on is null or started_on is null or finished_on >= started_on);

-- ---------------------------------------------------------------------------
-- Knowledge base: note ↔ record links are stored in record_links. Make lookups
-- in the forward direction cheap too.
-- ---------------------------------------------------------------------------
create index record_links_from_idx on public.record_links (user_id, from_type, from_id);

-- Wheel: one assessment per day keeps history readable.
create unique index wheel_assessments_user_day_key on public.wheel_assessments (user_id, assessed_on);
