-- Life OS · 0007 · Phase 2 daily productivity
-- Recurring task series, saved views, RRULE validation, search indexes,
-- and dependency-cycle protection.

-- A recurring task is a series: each completed occurrence spawns the next
-- row with the same series_id (history is kept per occurrence).
alter table public.tasks add column series_id uuid;
create index tasks_series_idx on public.tasks (series_id) where series_id is not null;
-- Only one open occurrence per series at a time.
create unique index tasks_series_open_key on public.tasks (series_id)
  where series_id is not null and status in ('todo', 'in_progress', 'waiting') and archived_at is null;

-- Basic RRULE shape check (full validation happens in the app).
alter table public.tasks add constraint tasks_rrule_shape
  check (recurrence_rule is null or recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$');
alter table public.tasks add constraint tasks_recurring_needs_due
  check (recurrence_rule is null or num_nonnulls(due_date, due_at) = 1);
alter table public.calendar_events add constraint calendar_events_rrule_shape
  check (recurrence_rule is null or recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$');
alter table public.reminders add constraint reminders_rrule_shape
  check (recurrence_rule is null or recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$');

-- Case-insensitive title search
create extension if not exists pg_trgm with schema extensions;
create index tasks_title_trgm_idx on public.tasks using gin (title extensions.gin_trgm_ops);
create index calendar_events_title_trgm_idx on public.calendar_events using gin (title extensions.gin_trgm_ops);
create index habits_name_trgm_idx on public.habits using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Saved views (named filter sets per module)
-- ---------------------------------------------------------------------------
create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  module_key  text not null check (module_key ~ '^[a-z][a-z0-9-]{1,40}$'),
  name        text not null check (char_length(name) between 1 and 60),
  filters     jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object' and pg_column_size(filters) < 4096),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index saved_views_user_name_key on public.saved_views (user_id, module_key, lower(name));
select private.apply_owner_policies('public.saved_views');

-- ---------------------------------------------------------------------------
-- Task dependencies may not form a cycle.
-- ---------------------------------------------------------------------------
create or replace function private.prevent_dependency_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    with recursive chain(id) as (
      select d.depends_on_task_id from public.task_dependencies d where d.task_id = new.depends_on_task_id
      union
      select d.depends_on_task_id from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) or new.depends_on_task_id = new.task_id then
    raise exception 'This dependency would create a cycle' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_dependency_cycle before insert or update on public.task_dependencies
  for each row execute function private.prevent_dependency_cycle();

-- Subtasks may not form a cycle either (A → B → A).
create or replace function private.prevent_subtask_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_task_id is not null and exists (
    with recursive up(id) as (
      select t.parent_task_id from public.tasks t where t.id = new.parent_task_id
      union
      select t.parent_task_id from public.tasks t join up on t.id = up.id where t.parent_task_id is not null
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'A task cannot be nested under its own subtask' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prevent_subtask_cycle before insert or update of parent_task_id on public.tasks
  for each row execute function private.prevent_subtask_cycle();
