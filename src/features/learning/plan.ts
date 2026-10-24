/**
 * Roadmap progress and study-time summaries. Pure: computed from the steps
 * and sessions already loaded, so nothing is stored twice.
 */
import { addDays, weekdayOf } from "@/lib/dates";
import type { LearningStep, Roadmap, StudySession } from "./types";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const mondayOf = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7));

export function roadmapProgress(steps: Pick<LearningStep, "done_at">[]): { done: number; total: number; pct: number } {
  const done = steps.filter((s) => s.done_at).length;
  return { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 };
}

/** The first step not yet done, in roadmap order. */
export const nextStep = <T extends Pick<LearningStep, "done_at" | "position">>(steps: T[]): T | null =>
  [...steps].sort((a, b) => a.position - b.position).find((s) => !s.done_at) ?? null;

/** "Mon, Wed, Fri at 19:00 · 30 min", or null without a plan. */
export function planLabel(r: Pick<Roadmap, "study_days" | "study_time" | "study_minutes">): string | null {
  if (!r.study_days.length) return null;
  const days = r.study_days.length === 7 ? "Every day" : WEEK_ORDER.filter((d) => r.study_days.includes(d)).map((d) => DAY[d]).join(", ");
  return [days + (r.study_time ? ` at ${r.study_time.slice(0, 5)}` : ""), r.study_minutes ? `${r.study_minutes} min` : null].filter(Boolean).join(" · ");
}

/** Minutes the plan asks for in a week, or null without one. */
export const plannedWeekMinutes = (r: Pick<Roadmap, "study_days" | "study_minutes">) => (r.study_days.length && r.study_minutes ? r.study_days.length * r.study_minutes : null);

/** Today or the next day in the plan, or null without one. */
export function nextStudyDay(days: number[], today: string): string | null {
  if (!days.length) return null;
  for (let i = 0; i < 7; i++) if (days.includes(weekdayOf(addDays(today, i)))) return addDays(today, i);
  return null;
}

export const minutesBetween = (sessions: Pick<StudySession, "studied_on" | "minutes">[], from: string, to: string) =>
  sessions.filter((s) => s.studied_on >= from && s.studied_on <= to).reduce((a, s) => a + s.minutes, 0);

/** Minutes per Monday–Sunday week, oldest first, ending with the current week. */
export function minutesByWeek(sessions: Pick<StudySession, "studied_on" | "minutes">[], today: string, weeks = 8): { start: string; minutes: number }[] {
  const mon = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(mon, -7 * (weeks - 1 - i))).map((start) => ({ start, minutes: minutesBetween(sessions, start, addDays(start, 6)) }));
}

/** Consecutive days with any study, counting back from today (or yesterday, so today isn't a break until it's over). */
export function studyStreak(sessions: Pick<StudySession, "studied_on">[], today: string): number {
  const days = new Set(sessions.map((s) => s.studied_on));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
