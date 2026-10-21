import { addDays, diffDays, zonedTimeToUtc } from "@/lib/dates";

/**
 * Pure health maths. Values are kept as the person typed them (with their
 * unit) and converted only for display. Nothing here labels a value as good
 * or bad: these are summaries of what was logged, not assessments.
 */

export type MeasurementSystem = "metric" | "imperial";
export type BodyMetric = "weight" | "body_fat_pct" | "waist" | "hip" | "chest" | "resting_hr" | "blood_pressure_sys" | "blood_pressure_dia";

export const METRIC_UNITS: Record<BodyMetric, string[]> = {
  weight: ["kg", "lb"],
  body_fat_pct: ["%"],
  waist: ["cm", "in"],
  hip: ["cm", "in"],
  chest: ["cm", "in"],
  resting_hr: ["bpm"],
  blood_pressure_sys: ["mmHg"],
  blood_pressure_dia: ["mmHg"],
};

/** The plausible range the database accepts, so forms can say so before saving. */
export const METRIC_RANGE: Record<string, [number, number]> = {
  "weight:kg": [2, 400], "weight:lb": [4, 900], "body_fat_pct:%": [1, 75],
  "length:cm": [20, 300], "length:in": [8, 120], "resting_hr:bpm": [20, 250], "bp:mmHg": [30, 300],
};

export function rangeFor(metric: BodyMetric, unit: string): [number, number] | null {
  const key = metric === "waist" || metric === "hip" || metric === "chest" ? `length:${unit}` : metric.startsWith("blood_pressure") ? `bp:${unit}` : `${metric}:${unit}`;
  return METRIC_RANGE[key] ?? null;
}

export const preferredUnit = (metric: BodyMetric, system: MeasurementSystem): string =>
  metric === "weight" ? (system === "imperial" ? "lb" : "kg") : metric === "waist" || metric === "hip" || metric === "chest" ? (system === "imperial" ? "in" : "cm") : METRIC_UNITS[metric][0];

const LB_PER_KG = 2.20462262185;
const CM_PER_IN = 2.54;

/** Converts between the units of one metric (kg↔lb, cm↔in); same unit passes through. Rounded to 1 decimal. */
export function convertUnit(value: number, from: string, to: string): number {
  let v = value;
  if (from === to) v = value;
  else if (from === "kg" && to === "lb") v = value * LB_PER_KG;
  else if (from === "lb" && to === "kg") v = value / LB_PER_KG;
  else if (from === "cm" && to === "in") v = value / CM_PER_IN;
  else if (from === "in" && to === "cm") v = value * CM_PER_IN;
  else throw new Error(`Can't convert ${from} to ${to}`);
  return Math.round(v * 10) / 10;
}

/* ------------------------------------------------------------------------ */
/* Sleep                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Turns "went to bed 23:30, woke 06:45 on the 12th" into two instants in the
 * person's time zone. A bedtime at or after the wake time is the evening
 * before; an earlier one (a nap, or bed after midnight) is the same day.
 */
export function sleepInstants(wakeDate: string, bed: string, wake: string, timeZone: string): { bedtime: Date; wakeTime: Date } {
  const bedDate = bed >= wake ? addDays(wakeDate, -1) : wakeDate;
  return { bedtime: zonedTimeToUtc(bedDate, bed, timeZone), wakeTime: zonedTimeToUtc(wakeDate, wake, timeZone) };
}

/** Minutes after local midnight for an instant in a time zone. */
export function localMinutes(instant: Date | string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export type Night = { sleep_date: string; bedtime: string; wake_time: string; duration_minutes: number; quality: number | null };

export type SleepSummary = {
  nights: number;
  avgMinutes: number | null;
  avgQuality: number | null;
  /** Typical bedtime and wake time (local clock), averaged around midnight. */
  avgBedtime: string | null;
  avgWake: string | null;
  /** How much bedtime moves night to night: the average distance from the typical bedtime, in minutes. */
  bedtimeSpread: number | null;
  shortest: Night | null;
  longest: Night | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function sleepSummary(nights: Night[], timeZone: string): SleepSummary {
  if (!nights.length) return { nights: 0, avgMinutes: null, avgQuality: null, avgBedtime: null, avgWake: null, bedtimeSpread: null, shortest: null, longest: null };
  // Bedtimes before noon belong to the night before: count them past 24:00 so 23:30 and 00:30 average to 00:00, not noon.
  const beds = nights.map((n) => { const m = localMinutes(n.bedtime, timeZone); return m < 720 ? m + 1440 : m; });
  const wakes = nights.map((n) => localMinutes(n.wake_time, timeZone));
  const avgBed = mean(beds)!;
  const q = nights.map((n) => n.quality).filter((x): x is number => x !== null);
  const sorted = [...nights].sort((a, b) => a.duration_minutes - b.duration_minutes);
  return {
    nights: nights.length,
    avgMinutes: Math.round(mean(nights.map((n) => n.duration_minutes))!),
    avgQuality: q.length ? Math.round(mean(q)! * 10) / 10 : null,
    avgBedtime: clock(avgBed),
    avgWake: clock(mean(wakes)!),
    bedtimeSpread: nights.length >= 3 ? Math.round(mean(beds.map((b) => Math.abs(b - avgBed)))!) : null,
    shortest: sorted[0],
    longest: sorted.at(-1)!,
  };
}

export const formatMinutes = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min) % 60).padStart(2, "0")}m`;

/* ------------------------------------------------------------------------ */
/* Wellness, hydration, workouts                                             */
/* ------------------------------------------------------------------------ */

export type Checkin = { log_date: string; logged_at: string; mood: number | null; energy: number | null; stress: number | null };
export type DayWellness = { date: string; mood: number | null; energy: number | null; stress: number | null; checkins: number };

/** One row per day in [start, end], averaging that day's check-ins; days without any are null, not zero. */
export function wellnessByDay(logs: Checkin[], start: string, end: string): DayWellness[] {
  const out: DayWellness[] = [];
  const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const day = logs.filter((l) => l.log_date === d);
    out.push({ date: d, mood: avg(day.map((l) => l.mood)), energy: avg(day.map((l) => l.energy)), stress: avg(day.map((l) => l.stress)), checkins: day.length });
  }
  return out;
}

export function averageOf(days: DayWellness[], key: "mood" | "energy" | "stress"): number | null {
  const v = days.map((d) => d[key]).filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

export function hydrationByDay(logs: { log_date: string; amount_ml: number }[], start: string, end: string): { date: string; ml: number }[] {
  const out: { date: string; ml: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push({ date: d, ml: logs.filter((l) => l.log_date === d).reduce((a, l) => a + l.amount_ml, 0) });
  return out;
}

export type WorkoutLite = { performed_on: string; activity: string; duration_minutes: number | null; perceived_effort: number | null };

export type WorkoutSummary = {
  sessions: number;
  activeDays: number;
  /** Minutes from sessions that recorded a duration; `untimed` counts those that didn't. */
  minutes: number;
  untimed: number;
  byActivity: { activity: string; sessions: number; minutes: number }[];
  avgEffort: number | null;
};

export function workoutSummary(workouts: WorkoutLite[], start: string, end: string): WorkoutSummary {
  const ws = workouts.filter((w) => w.performed_on >= start && w.performed_on <= end);
  const by = new Map<string, { activity: string; sessions: number; minutes: number }>();
  for (const w of ws) {
    const key = w.activity.trim().toLowerCase();
    const row = by.get(key) ?? { activity: w.activity.trim(), sessions: 0, minutes: 0 };
    row.sessions++;
    row.minutes += w.duration_minutes ?? 0;
    by.set(key, row);
  }
  const eff = ws.map((w) => w.perceived_effort).filter((x): x is number => x !== null);
  return {
    sessions: ws.length,
    activeDays: new Set(ws.map((w) => w.performed_on)).size,
    minutes: ws.reduce((a, w) => a + (w.duration_minutes ?? 0), 0),
    untimed: ws.filter((w) => w.duration_minutes === null).length,
    byActivity: [...by.values()].sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes),
    avgEffort: eff.length ? Math.round(mean(eff)! * 10) / 10 : null,
  };
}

export type SetLite = { exercise: string; reps: number | null; weight: string | null; weight_unit: "kg" | "lb" | null };

/** Total weight moved (reps × weight) per exercise, in one unit. Sets without reps or weight don't count. */
export function volumeByExercise(sets: SetLite[], unit: "kg" | "lb"): { exercise: string; sets: number; volume: number }[] {
  const by = new Map<string, { exercise: string; sets: number; volume: number }>();
  for (const s of sets) {
    const row = by.get(s.exercise.toLowerCase()) ?? { exercise: s.exercise, sets: 0, volume: 0 };
    row.sets++;
    if (s.reps && s.weight && s.weight_unit) row.volume += s.reps * convertUnit(Number(s.weight), s.weight_unit, unit);
    by.set(s.exercise.toLowerCase(), row);
  }
  return [...by.values()].map((r) => ({ ...r, volume: Math.round(r.volume) }));
}

/* ------------------------------------------------------------------------ */
/* Measurements                                                              */
/* ------------------------------------------------------------------------ */

export type Measurement = { measured_at: string; metric: BodyMetric; value: string; unit: string };

/** A metric's readings in one display unit, oldest first, with the change from the first to the latest. */
export function metricSeries(rows: Measurement[], metric: BodyMetric, unit: string): { points: { at: string; value: number }[]; latest: number | null; change: number | null } {
  const points = rows
    .filter((r) => r.metric === metric)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map((r) => ({ at: r.measured_at, value: convertUnit(Number(r.value), r.unit, unit) }));
  const latest = points.at(-1)?.value ?? null;
  return { points, latest, change: points.length >= 2 ? Math.round((latest! - points[0].value) * 10) / 10 : null };
}

/** Days since a date, for "last logged 3 days ago" labels. */
export const daysSince = (dateKey: string, today: string) => diffDays(dateKey, today);
