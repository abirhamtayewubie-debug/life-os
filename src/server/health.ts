import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HISTORY_DAYS, type HealthWorkspace, type MeasurementRow, type SleepLog, type WellnessLog, type Workout, type WorkoutProgram } from "@/features/health/types";
import type { LoggedSet } from "@/features/health/records";
import { getViewer } from "./viewer";

/** Health and sleep data for the last few months. Health data is private: it's read only with the person's own session. */
export async function getHealthWorkspace(now = new Date()): Promise<HealthWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale, measurementSystem } = viewer.profile;
  const today = localDateKey(now, timezone);
  const since = addDays(today, -HISTORY_DAYS + 1);
  const base = { today, since, timezone, locale, system: measurementSystem };

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return {
      ...base,
      wellness: s.wellness_logs.map((w) => ({ note: null, ...w })) as WellnessLog[],
      hydration: s.hydration_logs,
      workouts: s.workouts.map((w) => ({ program_id: null, program_day: null, ...w, sets: s.workout_sets.filter((x) => x.workout_id === w.id) })) as Workout[],
      programs: s.workout_programs.map((p) => ({ ...p, exercises: s.program_exercises.filter((e) => e.program_id === p.id) })) as WorkoutProgram[],
      exerciseLog: s.workout_sets.map((x) => ({ ...x, date: s.workouts.find((w) => w.id === x.workout_id)!.performed_on })) as LoggedSet[],
      measurements: s.body_measurements as MeasurementRow[],
      sleep: s.sleep_logs.map((n) => ({ awakenings: null, notes: null, device_name: null, ...n })) as SleepLog[],
      goals: s.goals.map(({ id, title }) => ({ id, title })),
      demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [wellness, hydration, workouts, measurements, sleep, goals, programs, log] = await Promise.all([
    supabase.from("wellness_logs").select("id, log_date, logged_at, mood, energy, stress, note, source").gte("log_date", since).order("logged_at", { ascending: false }).limit(2000),
    supabase.from("hydration_logs").select("id, log_date, amount_ml, source").gte("log_date", since).order("created_at", { ascending: false }).limit(3000),
    supabase.from("workouts").select("id, goal_id, program_id, program_day, performed_on, started_at, activity, duration_minutes, perceived_effort, notes, source, workout_sets(id, exercise, set_number, reps, weight::text, weight_unit, duration_seconds, distance_m::text)")
      .gte("performed_on", since).order("performed_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("body_measurements").select("id, measured_at, metric, value::text, unit, source").order("measured_at", { ascending: false }).limit(3000),
    supabase.from("sleep_logs").select("id, sleep_date, bedtime, wake_time, duration_minutes, quality, awakenings, notes, device_name, source").gte("sleep_date", since).order("sleep_date", { ascending: false }).limit(1000),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("workout_programs").select("id, name, description, goal_id, archived_at, source, program_exercises(id, day_label, position, exercise, target_sets, reps_min, reps_max, target_weight::text, weight_unit, rest_seconds, notes)")
      .order("name").limit(200),
    // All-time sets for records and progress; small rows, newest first.
    supabase.from("workout_sets").select("workout_id, exercise, set_number, reps, weight::text, weight_unit, duration_seconds, distance_m::text, workouts!inner(performed_on)")
      .order("created_at", { ascending: false }).limit(20000),
  ]);
  for (const r of [wellness, hydration, workouts, measurements, sleep, goals, programs, log]) if (r.error) throw new Error(`Could not load health data: ${r.error.message}`);
  return {
    ...base,
    wellness: (wellness.data ?? []) as WellnessLog[],
    hydration: hydration.data ?? [],
    workouts: (workouts.data ?? []).map(({ workout_sets, ...w }) => ({ ...w, sets: [...(workout_sets ?? [])].sort((a, b) => a.exercise.localeCompare(b.exercise) || a.set_number - b.set_number) })) as Workout[],
    measurements: (measurements.data ?? []) as MeasurementRow[],
    sleep: (sleep.data ?? []) as SleepLog[],
    programs: (programs.data ?? []).map(({ program_exercises, ...p }) => ({ ...p, exercises: [...(program_exercises ?? [])].sort((a, b) => a.position - b.position) })) as WorkoutProgram[],
    exerciseLog: (log.data ?? []).map(({ workouts: w, ...x }) => ({ ...x, date: (Array.isArray(w) ? w[0] : w).performed_on })) as LoggedSet[],
    goals: goals.data ?? [],
    demo: false,
  };
}
