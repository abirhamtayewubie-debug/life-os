import type { DataSource } from "@/features/dashboard/types";
import type { BodyMetric, MeasurementSystem } from "./metrics";
import type { LoggedSet } from "./records";

export type WellnessLog = { id: string; log_date: string; logged_at: string; mood: number | null; energy: number | null; stress: number | null; note: string | null; source: DataSource };
export type HydrationLog = { id: string; log_date: string; amount_ml: number; source: DataSource };
export type WorkoutSet = { id: string; exercise: string; set_number: number; reps: number | null; weight: string | null; weight_unit: "kg" | "lb" | null; duration_seconds: number | null; distance_m: string | null };
export type Workout = {
  id: string; goal_id: string | null; performed_on: string; started_at: string | null; activity: string;
  duration_minutes: number | null; perceived_effort: number | null; notes: string | null; source: DataSource; sets: WorkoutSet[];
  program_id: string | null; program_day: string | null;
};
export type ProgramExercise = {
  id: string; day_label: string; position: number; exercise: string; target_sets: number; reps_min: number | null; reps_max: number | null;
  target_weight: string | null; weight_unit: "kg" | "lb" | null; rest_seconds: number | null; notes: string | null;
};
export type WorkoutProgram = {
  id: string; name: string; description: string | null; goal_id: string | null; archived_at: string | null; source: DataSource;
  /** Ordered by day (in first-seen order), then position. */
  exercises: ProgramExercise[];
};
export type MeasurementRow = { id: string; measured_at: string; metric: BodyMetric; value: string; unit: string; source: DataSource };
export type SleepLog = {
  id: string; sleep_date: string; bedtime: string; wake_time: string; duration_minutes: number; quality: number | null;
  awakenings: number | null; notes: string | null; device_name: string | null; source: DataSource;
};

export type HealthWorkspace = {
  today: string;
  /** First day loaded; older history isn't shown on these screens. */
  since: string;
  timezone: string;
  locale: string;
  system: MeasurementSystem;
  wellness: WellnessLog[];
  hydration: HydrationLog[];
  workouts: Workout[];
  measurements: MeasurementRow[];
  sleep: SleepLog[];
  programs: WorkoutProgram[];
  /** Every logged set with its workout date, all time, for records and progress. */
  exerciseLog: LoggedSet[];
  goals: { id: string; title: string }[];
  demo: boolean;
};

export const METRIC_LABEL: Record<BodyMetric, string> = {
  weight: "Weight", body_fat_pct: "Body fat", waist: "Waist", hip: "Hips", chest: "Chest", resting_hr: "Resting heart rate",
  blood_pressure_sys: "Blood pressure (systolic)", blood_pressure_dia: "Blood pressure (diastolic)",
};

export const SCALE_LABEL = {
  mood: ["Very low", "Low", "Okay", "Good", "Great"],
  energy: ["Drained", "Low", "Steady", "Good", "Full"],
  stress: ["Calm", "Light", "Some", "High", "Very high"],
} as const;

export const HISTORY_DAYS = 120;

/** A program's days in the order they were written, each with its exercises. */
export function programDays(p: Pick<WorkoutProgram, "exercises">): { label: string; exercises: ProgramExercise[] }[] {
  const days: { label: string; exercises: ProgramExercise[] }[] = [];
  for (const e of p.exercises) {
    let d = days.find((x) => x.label === e.day_label);
    if (!d) days.push((d = { label: e.day_label, exercises: [] }));
    d.exercises.push(e);
  }
  return days;
}
