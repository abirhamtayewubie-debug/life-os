-- Workout programs: ownership, targets, and what survives a delete.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a8', 'alice8@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b8', 'bob8@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);

insert into public.workout_programs (id, user_id, name) values
  ('48000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'Full body 3x');
insert into public.program_exercises (user_id, program_id, day_label, position, exercise, target_sets, reps_min, reps_max, target_weight, weight_unit) values
  ('00000000-0000-0000-0000-0000000000a8', '48000000-0000-0000-0000-000000000001', 'Day A', 1, 'Squat', 3, 6, 8, 60, 'kg'),
  ('00000000-0000-0000-0000-0000000000a8', '48000000-0000-0000-0000-000000000001', 'Day A', 2, 'Push-up', 3, 10, 15, null, null);
insert into public.workouts (id, user_id, performed_on, activity, program_id, program_day) values
  ('48000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a8', current_date, 'Full body 3x · Day A', '48000000-0000-0000-0000-000000000001', 'Day A');

do $$ begin
  -- A weight needs a unit, and a rep range can't run backwards.
  begin
    insert into public.program_exercises (user_id, program_id, day_label, position, exercise, target_weight) values
      ('00000000-0000-0000-0000-0000000000a8', '48000000-0000-0000-0000-000000000001', 'Day A', 3, 'Row', 20);
    raise exception 'FAIL: weight without unit accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.program_exercises (user_id, program_id, day_label, position, exercise, reps_min, reps_max) values
      ('00000000-0000-0000-0000-0000000000a8', '48000000-0000-0000-0000-000000000001', 'Day A', 3, 'Row', 12, 8);
    raise exception 'FAIL: backwards rep range accepted';
  exception when check_violation then null;
  end;
end $$;

-- Bob can't see Alice's programs or attach to them.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.workout_programs) <> 0 then raise exception 'FAIL: Bob sees programs'; end if;
  if (select count(*) from public.program_exercises) <> 0 then raise exception 'FAIL: Bob sees program exercises'; end if;
  begin
    insert into public.program_exercises (user_id, program_id, day_label, position, exercise) values
      ('00000000-0000-0000-0000-0000000000b8', '48000000-0000-0000-0000-000000000001', 'Day A', 9, 'Hijack');
    raise exception 'FAIL: Bob added to Alice''s program';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.workouts (user_id, performed_on, activity, program_id) values
      ('00000000-0000-0000-0000-0000000000b8', current_date, 'Hijack', '48000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: Bob linked a workout to Alice''s program';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Deleting the program removes its plan but keeps the workouts done from it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}', true);
delete from public.workout_programs where id = '48000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.program_exercises) <> 0 then raise exception 'FAIL: program exercises survived the program'; end if;
  if (select count(*) from public.workouts where id = '48000000-0000-0000-0000-000000000002' and program_id is null and program_day = 'Day A') <> 1 then
    raise exception 'FAIL: workout lost with the program';
  end if;
end $$;

reset role;
select 'Workout program database tests passed' as result;
rollback;
