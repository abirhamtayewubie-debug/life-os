-- Learning roadmaps, study plans and study sessions (additive; no existing row changes).
--
-- A roadmap is an ordered list of steps toward a skill or goal; a step can
-- point at an existing learning item (a book, a course) and can be an
-- exercise to practise rather than something to read. A roadmap can carry a
-- weekly study plan (days, time, minutes). Its reminder is an ordinary
-- repeating `reminders` row tied to the roadmap, delivered by the existing
-- sender like habit reminders, and quiet on days a session is already logged.

-- Composite keys so new rows can reference these with the owner check built in.
alter table public.skills add constraint skills_id_user_key unique (id, user_id);
alter table public.learning_items add constraint learning_items_id_user_key unique (id, user_id);

create table public.learning_roadmaps (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  description    text check (char_length(description) <= 5000),
  goal_id        uuid,
  skill_id       uuid,
  target_date    date,
  study_days     smallint[] not null default '{}' check (study_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  study_time     time,
  study_minutes  smallint check (study_minutes between 5 and 600),
  archived_at    timestamptz,
  source         public.data_source not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id),
  foreign key (skill_id, user_id) references public.skills (id, user_id) on delete set null (skill_id)
);
create index learning_roadmaps_user_idx on public.learning_roadmaps (user_id, archived_at);
create index learning_roadmaps_goal_idx on public.learning_roadmaps (goal_id);
create index learning_roadmaps_skill_idx on public.learning_roadmaps (skill_id);
select private.apply_owner_policies('public.learning_roadmaps');

create table public.learning_steps (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  roadmap_id        uuid not null,
  position          smallint not null check (position between 1 and 500),
  title             text not null check (char_length(title) between 1 and 300),
  is_exercise       boolean not null default false,
  learning_item_id  uuid,
  notes             text check (char_length(notes) <= 2000),
  done_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (roadmap_id, user_id) references public.learning_roadmaps (id, user_id) on delete cascade,
  foreign key (learning_item_id, user_id) references public.learning_items (id, user_id) on delete set null (learning_item_id)
);
create index learning_steps_roadmap_idx on public.learning_steps (roadmap_id, position);
create index learning_steps_item_idx on public.learning_steps (learning_item_id);
select private.apply_owner_policies('public.learning_steps');

create table public.study_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  studied_on        date not null,                       -- user's local date
  minutes           smallint not null check (minutes between 1 and 1440),
  roadmap_id        uuid,
  learning_item_id  uuid,
  step_id           uuid,
  notes             text check (char_length(notes) <= 2000),
  source            public.data_source not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (roadmap_id, user_id) references public.learning_roadmaps (id, user_id) on delete set null (roadmap_id),
  foreign key (learning_item_id, user_id) references public.learning_items (id, user_id) on delete set null (learning_item_id),
  foreign key (step_id, user_id) references public.learning_steps (id, user_id) on delete set null (step_id)
);
create index study_sessions_user_date_idx on public.study_sessions (user_id, studied_on desc);
create index study_sessions_roadmap_idx on public.study_sessions (roadmap_id);
create index study_sessions_item_idx on public.study_sessions (learning_item_id);
create index study_sessions_step_idx on public.study_sessions (step_id);
select private.apply_owner_policies('public.study_sessions');

-- Study reminders: one repeating reminder per roadmap, like habit reminders.
alter table public.reminders add column roadmap_id uuid;
alter table public.reminders
  add constraint reminders_roadmap_fk foreign key (roadmap_id, user_id) references public.learning_roadmaps (id, user_id) on delete cascade;
alter table public.reminders
  add constraint reminders_roadmap_repeats check (roadmap_id is null or recurrence_rule is not null);
create index reminders_roadmap_idx on public.reminders (roadmap_id);
create unique index reminders_one_live_per_roadmap on public.reminders (user_id, roadmap_id)
  where roadmap_id is not null and status in ('scheduled', 'snoozed');
