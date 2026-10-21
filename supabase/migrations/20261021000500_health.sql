-- Life OS · 0005 · Health, fitness, sleep, wellness
-- Sensitive data. Every row records its provenance (manual vs device) so the UI
-- never presents a self-report as a measurement. No diagnostic fields.

create table public.wellness_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  logged_at   timestamptz not null default now(),
  log_date    date not null,                       -- user's local date
  mood        smallint check (mood between 1 and 5),
  energy      smallint check (energy between 1 and 5),
  stress      smallint check (stress between 1 and 5),
  note        text check (char_length(note) <= 2000),
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(mood, energy, stress) >= 1)
);
create index wellness_logs_user_date_idx on public.wellness_logs (user_id, log_date desc);
select private.apply_owner_policies('public.wellness_logs');

create table public.sleep_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  sleep_date        date not null,                 -- local date of waking
  bedtime           timestamptz not null,
  wake_time         timestamptz not null,
  duration_minutes  integer generated always as ((extract(epoch from (wake_time - bedtime)) / 60)::integer) stored,
  quality           smallint check (quality between 1 and 5),  -- subjective
  awakenings        smallint check (awakenings between 0 and 50),
  notes             text check (char_length(notes) <= 2000),
  device_name       text check (char_length(device_name) <= 80),
  source            public.data_source not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (wake_time > bedtime and wake_time - bedtime < interval '24 hours'),
  check ((source = 'device') = (device_name is not null))
);
create unique index sleep_logs_user_date_source_key on public.sleep_logs (user_id, sleep_date, source);
select private.apply_owner_policies('public.sleep_logs');

create table public.workouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  goal_id           uuid,
  performed_on      date not null,
  started_at        timestamptz,
  activity          text not null check (char_length(activity) between 1 and 80),
  duration_minutes  integer check (duration_minutes between 1 and 1440),
  perceived_effort  smallint check (perceived_effort between 1 and 10),
  notes             text check (char_length(notes) <= 2000),
  source            public.data_source not null default 'manual',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete set null (goal_id)
);
create index workouts_user_date_idx on public.workouts (user_id, performed_on desc);
create index workouts_goal_idx on public.workouts (goal_id);
select private.apply_owner_policies('public.workouts');

create type public.weight_unit as enum ('kg', 'lb');

create table public.workout_sets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  workout_id        uuid not null,
  exercise          text not null check (char_length(exercise) between 1 and 80),
  set_number        smallint not null check (set_number between 1 and 100),
  reps              smallint check (reps between 0 and 1000),
  weight            numeric(7, 2) check (weight >= 0),
  weight_unit       public.weight_unit,
  duration_seconds  integer check (duration_seconds between 0 and 86400),
  distance_m        numeric(10, 2) check (distance_m >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((weight is null) = (weight_unit is null)),
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade
);
create index workout_sets_workout_idx on public.workout_sets (workout_id, set_number);
select private.apply_owner_policies('public.workout_sets');

create type public.body_metric as enum ('weight', 'body_fat_pct', 'waist', 'hip', 'chest', 'resting_hr', 'blood_pressure_sys', 'blood_pressure_dia');

create table public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  measured_at  timestamptz not null,
  metric       public.body_metric not null,
  value        numeric(10, 3) not null check (value > 0),
  unit         text not null check (char_length(unit) <= 12),
  source       public.data_source not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index body_measurements_user_metric_idx on public.body_measurements (user_id, metric, measured_at desc);
select private.apply_owner_policies('public.body_measurements');

create table public.hydration_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  log_date    date not null,
  amount_ml   integer not null check (amount_ml between 1 and 10000),
  source      public.data_source not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index hydration_logs_user_date_idx on public.hydration_logs (user_id, log_date desc);
select private.apply_owner_policies('public.hydration_logs');
