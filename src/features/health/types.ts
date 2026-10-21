import type { DataSource } from "@/features/dashboard/types";
import type { BodyMetric, MeasurementSystem } from "./metrics";

export type WellnessLog = { id: string; log_date: string; logged_at: string; mood: number | null; energy: number | null; stress: number | null; note: string | null; source: DataSource };
export type HydrationLog = { id: string; log_date: string; amount_ml: number; source: DataSource };
export type WorkoutSet = { id: string; exercise: string; set_number: number; reps: number | null; weight: string | null; weight_unit: "kg" | "lb" | null; duration_seconds: number | null; distance_m: string | null };
export type Workout = {
  id: string; goal_id: string | null; performed_on: string; started_at: string | null; activity: string;
  duration_minutes: number | null; perceived_effort: number | null; notes: string | null; source: DataSource; sets: WorkoutSet[];
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
