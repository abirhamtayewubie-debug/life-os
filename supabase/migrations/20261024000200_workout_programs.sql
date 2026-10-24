-- Workout programs (additive; no existing row changes).
--
-- A program is a reusable plan: named days ("Push", "Day A") each with an
-- ordered list of exercises and targets. Starting a day pre-fills an ordinary
-- workout, which remembers the program and day it came from. Personal records
-- and progress are computed from workout_sets, so nothing is stored twice.

create table public.workout_programs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  goal_id      uuid,
  name         text not null check (char_length(name) between 1 and 80),
  description  text check (char_length(description) <= 2000),
  archived_at  timestamptz,
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index workout_programs_user_idx on public.workout_programs (user_id, archived_at, name);
create index workout_programs_goal_idx on public.workout_programs (goal_id);
select private.apply_owner_policies('public.workout_programs');

create table public.program_exercises (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  program_id     uuid not null,
  day_label      text not null check (char_length(day_label) between 1 and 40),
  position       smallint not null check (position between 1 and 200),
  exercise       text not null check (char_length(exercise) between 1 and 80),
  target_sets    smallint not null default 3 check (target_sets between 1 and 20),
  reps_min       smallint check (reps_min between 0 and 1000),
  reps_max       smallint check (reps_max between 0 and 1000),
  target_weight  numeric(7, 2) check (target_weight >= 0),
  weight_unit    public.weight_unit,
  rest_seconds   integer check (rest_seconds between 0 and 3600),
  notes          text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((target_weight is null) = (weight_unit is null)),
  check (reps_min is null or reps_max is null or reps_max >= reps_min),
  foreign key (program_id, user_id) references public.workout_programs (id, user_id) on delete cascade
);
create index program_exercises_program_idx on public.program_exercises (program_id, day_label, position);
select private.apply_owner_policies('public.program_exercises');

-- A workout may come from a program day. Deleting the program keeps the workout.
alter table public.workouts add column program_id uuid;
alter table public.workouts add column program_day text check (char_length(program_day) between 1 and 40);
alter table public.workouts
  add constraint workouts_program_fk foreign key (program_id, user_id) references public.workout_programs (id, user_id) on delete set null (program_id);
create index workouts_program_idx on public.workouts (program_id);
