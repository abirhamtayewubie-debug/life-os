-- Life OS · 0011 · Health, sleep and report rules
-- Values a person types are kept as typed (with their unit); the app converts
-- for display only. Nothing here classifies a value as healthy or unhealthy.

-- Units for display: metric (kg, cm) or imperial (lb, in).
alter table public.profiles
  add column measurement_system text not null default 'metric' check (measurement_system in ('metric', 'imperial'));

-- Each body metric has its own units and a plausible range, so a slip of the
-- keyboard (82 kg typed as 820) is refused rather than charted.
alter table public.body_measurements
  add constraint body_measurements_metric_unit_check check (
    (metric = 'weight' and unit in ('kg', 'lb')) or
    (metric = 'body_fat_pct' and unit = '%') or
    (metric in ('waist', 'hip', 'chest') and unit in ('cm', 'in')) or
    (metric = 'resting_hr' and unit = 'bpm') or
    (metric in ('blood_pressure_sys', 'blood_pressure_dia') and unit = 'mmHg')
  ),
  add constraint body_measurements_range_check check (
    case
      when metric = 'weight' and unit = 'kg' then value between 2 and 400
      when metric = 'weight' and unit = 'lb' then value between 4 and 900
      when metric = 'body_fat_pct' then value between 1 and 75
      when metric in ('waist', 'hip', 'chest') and unit = 'cm' then value between 20 and 300
      when metric in ('waist', 'hip', 'chest') and unit = 'in' then value between 8 and 120
      when metric = 'resting_hr' then value between 20 and 250
      else value between 30 and 300
    end
  );

-- A blood pressure reading is a pair taken at the same moment.
create unique index body_measurements_reading_key on public.body_measurements (user_id, metric, measured_at, source);

-- Workouts: one entry per set number per exercise in a workout.
create unique index workout_sets_number_key on public.workout_sets (workout_id, exercise, set_number);

create index sleep_logs_user_date_idx on public.sleep_logs (user_id, sleep_date desc);

-- Saved reports hold computed facts as a JSON object; AI interpretation (phase 6)
-- stays in its own column.
alter table public.reports
  add constraint reports_measured_object check (jsonb_typeof(measured) = 'object'),
  add constraint reports_period_bounds check (period_end - period_start <= 366);
