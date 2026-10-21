-- Phase 5 database rules: units and plausible ranges for body measurements,
-- one reading per moment, sleep and workout integrity, saved report shape,
-- and isolation of health data between people.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a5', 'alice5@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b5', 'bob5@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);

-- Measurement system defaults to metric and only takes the two systems.
do $$ begin
  if (select measurement_system from public.profiles where id = '00000000-0000-0000-0000-0000000000a5') <> 'metric' then raise exception 'FAIL: default measurement system'; end if;
  begin
    update public.profiles set measurement_system = 'stones' where id = '00000000-0000-0000-0000-0000000000a5';
    raise exception 'FAIL: unknown measurement system accepted';
  exception when check_violation then null;
  end;
end $$;

-- Body measurements: valid readings in either unit system.
insert into public.body_measurements (user_id, measured_at, metric, value, unit) values
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-20 07:00+03', 'weight', 81.4, 'kg'),
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:00+03', 'weight', 179.5, 'lb'),
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:00+03', 'waist', 35.5, 'in'),
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:00+03', 'resting_hr', 61, 'bpm'),
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:05+03', 'blood_pressure_sys', 118, 'mmHg'),
  ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:05+03', 'blood_pressure_dia', 76, 'mmHg');

do $$
declare
  bad record;
begin
  -- Wrong unit for the metric, or a value outside the plausible range.
  for bad in select * from (values
    ('weight', 80::numeric, 'cm', 'weight in cm'),
    ('resting_hr', 60, 'kg', 'heart rate in kg'),
    ('blood_pressure_sys', 120, 'bpm', 'blood pressure in bpm'),
    ('weight', 820, 'kg', '820 kg'),
    ('weight', 1, 'kg', '1 kg'),
    ('weight', 950, 'lb', '950 lb'),
    ('body_fat_pct', 90, '%', '90% body fat'),
    ('waist', 900, 'cm', '900 cm waist'),
    ('waist', 150, 'in', '150 in waist'),
    ('resting_hr', 400, 'bpm', 'heart rate 400'),
    ('blood_pressure_dia', 10, 'mmHg', 'diastolic 10')
  ) as t(metric, value, unit, label) loop
    begin
      insert into public.body_measurements (user_id, measured_at, metric, value, unit)
      values ('00000000-0000-0000-0000-0000000000a5', '2026-10-01 07:00+03', bad.metric::public.body_metric, bad.value, bad.unit);
      raise exception 'FAIL: % accepted', bad.label;
    exception when check_violation then null;
    end;
  end loop;

  -- The same metric can't be recorded twice for the same moment and source.
  begin
    insert into public.body_measurements (user_id, measured_at, metric, value, unit)
    values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21 07:05+03', 'blood_pressure_sys', 125, 'mmHg');
    raise exception 'FAIL: duplicate reading accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Sleep: one manual night per wake date; wake must follow bedtime within a day.
insert into public.sleep_logs (user_id, sleep_date, bedtime, wake_time, quality)
values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', '2026-10-20 23:20+03', '2026-10-21 06:50+03', 4);

do $$ begin
  if (select duration_minutes from public.sleep_logs where sleep_date = '2026-10-21') <> 450 then raise exception 'FAIL: sleep duration across midnight'; end if;
  begin
    insert into public.sleep_logs (user_id, sleep_date, bedtime, wake_time)
    values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', '2026-10-20 22:00+03', '2026-10-21 05:00+03');
    raise exception 'FAIL: second manual night for one date accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.sleep_logs (user_id, sleep_date, bedtime, wake_time)
    values ('00000000-0000-0000-0000-0000000000a5', '2026-10-19', '2026-10-19 07:00+03', '2026-10-18 23:00+03');
    raise exception 'FAIL: wake before bedtime accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.sleep_logs (user_id, sleep_date, bedtime, wake_time, quality)
    values ('00000000-0000-0000-0000-0000000000a5', '2026-10-18', '2026-10-17 23:00+03', '2026-10-18 07:00+03', 6);
    raise exception 'FAIL: rested 6/5 accepted';
  exception when check_violation then null;
  end;
end $$;

-- Workouts and sets: set numbers are unique per exercise; sets go with their workout.
insert into public.workouts (id, user_id, performed_on, activity, duration_minutes)
values ('75000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a5', '2026-10-20', 'Strength', 45);
insert into public.workout_sets (user_id, workout_id, exercise, set_number, reps, weight, weight_unit) values
  ('00000000-0000-0000-0000-0000000000a5', '75000000-0000-0000-0000-000000000001', 'Squat', 1, 5, 80, 'kg'),
  ('00000000-0000-0000-0000-0000000000a5', '75000000-0000-0000-0000-000000000001', 'Squat', 2, 5, 80, 'kg'),
  ('00000000-0000-0000-0000-0000000000a5', '75000000-0000-0000-0000-000000000001', 'Row', 1, 8, 50, 'kg');

do $$ begin
  begin
    insert into public.workout_sets (user_id, workout_id, exercise, set_number, reps)
    values ('00000000-0000-0000-0000-0000000000a5', '75000000-0000-0000-0000-000000000001', 'Squat', 2, 5);
    raise exception 'FAIL: duplicate set number accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.workout_sets (user_id, workout_id, exercise, set_number, weight)
    values ('00000000-0000-0000-0000-0000000000a5', '75000000-0000-0000-0000-000000000001', 'Bench', 1, 60);
    raise exception 'FAIL: weight without a unit accepted';
  exception when check_violation then null;
  end;
  delete from public.workouts where id = '75000000-0000-0000-0000-000000000001';
  if exists (select 1 from public.workout_sets) then raise exception 'FAIL: sets outlived their workout'; end if;
end $$;
insert into public.workouts (id, user_id, performed_on, activity)
values ('75000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a5', '2026-10-21', 'Walk');

-- Check-ins need at least one rating; water amounts are bounded.
insert into public.wellness_logs (user_id, log_date, mood) values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', 4);
insert into public.hydration_logs (user_id, log_date, amount_ml) values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', 500);
do $$ begin
  begin
    insert into public.wellness_logs (user_id, log_date, note) values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', 'just a note');
    raise exception 'FAIL: empty check-in accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.hydration_logs (user_id, log_date, amount_ml) values ('00000000-0000-0000-0000-0000000000a5', '2026-10-21', 0);
    raise exception 'FAIL: 0 ml accepted';
  exception when check_violation then null;
  end;
end $$;

-- Saved reports: facts are a JSON object, one snapshot per period, at most a year long.
insert into public.reports (user_id, period, period_start, period_end, measured)
values ('00000000-0000-0000-0000-0000000000a5', 'weekly', '2026-10-19', '2026-10-25', '{"days":3}');
do $$ begin
  begin
    insert into public.reports (user_id, period, period_start, period_end, measured)
    values ('00000000-0000-0000-0000-0000000000a5', 'monthly', '2026-10-01', '2026-10-31', '[1,2]');
    raise exception 'FAIL: non-object report facts accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reports (user_id, period, period_start, period_end, measured)
    values ('00000000-0000-0000-0000-0000000000a5', 'annual', '2025-01-01', '2026-12-31', '{}');
    raise exception 'FAIL: two-year report accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reports (user_id, period, period_start, period_end, measured)
    values ('00000000-0000-0000-0000-0000000000a5', 'weekly', '2026-10-19', '2026-10-25', '{}');
    raise exception 'FAIL: second snapshot for one period accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Bob sees and changes none of it, and can't attach sets to Alice's workout.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.body_measurements) then raise exception 'FAIL: Bob sees measurements'; end if;
  if exists (select 1 from public.sleep_logs) then raise exception 'FAIL: Bob sees sleep'; end if;
  if exists (select 1 from public.workouts) or exists (select 1 from public.workout_sets) then raise exception 'FAIL: Bob sees workouts'; end if;
  if exists (select 1 from public.wellness_logs) then raise exception 'FAIL: Bob sees check-ins'; end if;
  if exists (select 1 from public.hydration_logs) then raise exception 'FAIL: Bob sees water'; end if;
  if exists (select 1 from public.reports) then raise exception 'FAIL: Bob sees reports'; end if;
  begin
    insert into public.workout_sets (user_id, workout_id, exercise, set_number)
    values ('00000000-0000-0000-0000-0000000000b5', '75000000-0000-0000-0000-000000000002', 'Sneaky', 1);
    raise exception 'FAIL: Bob added a set to Alice''s workout';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.body_measurements (user_id, measured_at, metric, value, unit)
    values ('00000000-0000-0000-0000-0000000000a5', now(), 'weight', 70, 'kg');
    raise exception 'FAIL: Bob wrote a measurement as Alice';
  exception when insufficient_privilege then null;
  end;
  update public.sleep_logs set quality = 1;
  update public.reports set interpretation = 'hacked';
  delete from public.body_measurements;
  delete from public.wellness_logs;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', true);
do $$ begin
  if (select quality from public.sleep_logs where sleep_date = '2026-10-21') <> 4 then raise exception 'FAIL: Bob changed Alice''s sleep'; end if;
  if exists (select 1 from public.reports where interpretation is not null) then raise exception 'FAIL: Bob wrote an interpretation'; end if;
  if (select count(*) from public.body_measurements) <> 6 then raise exception 'FAIL: Bob deleted measurements'; end if;
  if not exists (select 1 from public.wellness_logs) then raise exception 'FAIL: Bob deleted check-ins'; end if;
end $$;

reset role;
select 'Phase 5 database tests passed' as result;
rollback;
