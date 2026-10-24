/**
 * Exercise history, personal records and progress, computed from the sets
 * already logged in workouts. Nothing here is stored: a record is simply the
 * best logged set, so editing or deleting a workout updates it everywhere.
 */
import { convertUnit } from "./metrics";

export type LoggedSet = {
  workout_id: string;
  date: string;
  exercise: string;
  set_number: number;
  reps: number | null;
  weight: string | null;
  weight_unit: "kg" | "lb" | null;
  distance_m: string | null;
  duration_seconds: number | null;
};

export const exerciseKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const round = (n: number, step = 0.5) => Math.round(n / step) * step;

/** Estimated one-rep max (Epley). Only sets of 1–12 reps give a useful estimate. */
export function estimatedMax(weight: number, reps: number): number | null {
  if (!weight || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

const kgOf = (s: LoggedSet, unit: "kg" | "lb") => (s.weight !== null && s.weight_unit ? convertUnit(Number(s.weight), s.weight_unit, unit) : null);

export type ExerciseSummary = { key: string; name: string; sessions: number; lastDate: string };

/** Every exercise ever logged, most used first. The name shown is the most recent spelling. */
export function exerciseList(log: LoggedSet[]): ExerciseSummary[] {
  const by = new Map<string, { name: string; days: Set<string>; lastDate: string }>();
  for (const s of log) {
    const k = exerciseKey(s.exercise);
    const e = by.get(k) ?? { name: s.exercise.trim(), days: new Set<string>(), lastDate: "" };
    e.days.add(s.workout_id);
    if (s.date >= e.lastDate) { e.lastDate = s.date; e.name = s.exercise.trim(); }
    by.set(k, e);
  }
  return [...by.entries()]
    .map(([key, e]) => ({ key, name: e.name, sessions: e.days.size, lastDate: e.lastDate }))
    .sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

export type Best = { value: number; date: string; detail: string };
export type ExerciseRecords = {
  key: string;
  name: string;
  heaviest: Best | null;
  estimatedMax: Best | null;
  mostReps: Best | null;
  bestSession: Best | null;
  longest: Best | null;
};

/** The best logged set of each kind for one exercise, in one weight unit. Ties go to the earliest date. */
export function recordsFor(log: LoggedSet[], key: string, unit: "kg" | "lb"): ExerciseRecords {
  const sets = log.filter((s) => exerciseKey(s.exercise) === key).sort((a, b) => a.date.localeCompare(b.date) || a.set_number - b.set_number);
  const name = sets.at(-1)?.exercise.trim() ?? key;
  let heaviest: Best | null = null;
  let est: Best | null = null;
  let mostReps: Best | null = null;
  let longest: Best | null = null;
  const sessions = new Map<string, { date: string; volume: number }>();
  for (const s of sets) {
    const w = kgOf(s, unit);
    if (w !== null && w > 0 && (!heaviest || w > heaviest.value)) heaviest = { value: round(w, 0.1), date: s.date, detail: s.reps ? `${s.reps} reps` : "" };
    if (w !== null && s.reps) {
      const e = estimatedMax(w, s.reps);
      if (e !== null && (!est || e > est.value)) est = { value: round(e), date: s.date, detail: `from ${s.reps} × ${round(w, 0.1)} ${unit}` };
    }
    if (s.reps && (!mostReps || s.reps > mostReps.value)) mostReps = { value: s.reps, date: s.date, detail: w ? `at ${round(w, 0.1)} ${unit}` : "" };
    if (s.distance_m && (!longest || Number(s.distance_m) / 1000 > longest.value)) longest = { value: Math.round(Number(s.distance_m) / 10) / 100, date: s.date, detail: "" };
    if (w !== null && s.reps) {
      const x = sessions.get(s.workout_id) ?? { date: s.date, volume: 0 };
      x.volume += w * s.reps;
      sessions.set(s.workout_id, x);
    }
  }
  let bestSession: Best | null = null;
  for (const x of [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!bestSession || x.volume > bestSession.value) bestSession = { value: Math.round(x.volume), date: x.date, detail: "" };
  }
  return { key, name, heaviest, estimatedMax: est, mostReps, bestSession, longest };
}

export type ProgressPoint = { date: string; top: number | null; estimatedMax: number | null; volume: number; reps: number; sets: number };

/** One point per workout for an exercise, oldest first: top weight, best estimated max, volume and total reps. */
export function exerciseProgress(log: LoggedSet[], key: string, unit: "kg" | "lb"): ProgressPoint[] {
  const by = new Map<string, ProgressPoint>();
  for (const s of log) {
    if (exerciseKey(s.exercise) !== key) continue;
    const p = by.get(s.workout_id) ?? { date: s.date, top: null, estimatedMax: null, volume: 0, reps: 0, sets: 0 };
    const w = kgOf(s, unit);
    p.sets++;
    p.reps += s.reps ?? 0;
    if (w !== null && w > 0) p.top = Math.max(p.top ?? 0, round(w, 0.1));
    if (w !== null && s.reps) {
      p.volume += Math.round(w * s.reps);
      const e = estimatedMax(w, s.reps);
      if (e !== null) p.estimatedMax = Math.max(p.estimatedMax ?? 0, round(e));
    }
    by.set(s.workout_id, p);
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * New records per workout: a set that beats every earlier workout's best
 * weight, estimated max or reps for that exercise. The first time an
 * exercise is logged sets the baseline; it isn't called a record.
 */
export function recordsByWorkout(log: LoggedSet[], unit: "kg" | "lb"): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const best = new Map<string, { weight: number; est: number; reps: number }>();
  const workouts = new Map<string, { date: string; sets: LoggedSet[] }>();
  for (const s of log) {
    const w = workouts.get(s.workout_id) ?? { date: s.date, sets: [] };
    w.sets.push(s);
    workouts.set(s.workout_id, w);
  }
  const ordered = [...workouts.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date) || a[0].localeCompare(b[0]));
  for (const [id, w] of ordered) {
    const today = new Map<string, { name: string; weight: number; est: number; reps: number }>();
    for (const s of w.sets) {
      const k = exerciseKey(s.exercise);
      const t = today.get(k) ?? { name: s.exercise.trim(), weight: 0, est: 0, reps: 0 };
      t.name = s.exercise.trim();
      const kg = kgOf(s, unit) ?? 0;
      t.weight = Math.max(t.weight, kg);
      if (s.reps) {
        t.est = Math.max(t.est, estimatedMax(kg, s.reps) ?? 0);
        if (!kg) t.reps = Math.max(t.reps, s.reps);
      }
      today.set(k, t);
    }
    const notes: string[] = [];
    for (const [k, t] of today) {
      const prev = best.get(k);
      if (prev) {
        if (t.weight > prev.weight) notes.push(`${t.name} ${round(t.weight, 0.1)} ${unit}`);
        else if (t.est > prev.est + 0.01) notes.push(`${t.name} est. max ${round(t.est)} ${unit}`);
        else if (t.reps > prev.reps && prev.weight === 0 && t.weight === 0) notes.push(`${t.name} ${t.reps} reps`);
      }
      best.set(k, { weight: Math.max(prev?.weight ?? 0, t.weight), est: Math.max(prev?.est ?? 0, t.est), reps: Math.max(prev?.reps ?? 0, t.reps) });
    }
    if (notes.length) out.set(id, notes);
  }
  return out;
}

/** The top set of the most recent session of an exercise, to suggest where to start. */
export function lastSetFor(log: LoggedSet[], name: string): LoggedSet | null {
  const k = exerciseKey(name);
  const mine = log.filter((s) => exerciseKey(s.exercise) === k);
  if (!mine.length) return null;
  const lastDate = mine.reduce((d, s) => (s.date > d ? s.date : d), "");
  return mine.filter((s) => s.date === lastDate).reduce((a, s) => (Number(s.weight ?? 0) > Number(a.weight ?? 0) ? s : a));
}
