/**
 * Weekly and monthly reviews use the same period boundaries as Reports
 * (including the week-start setting), so a review and its report line up.
 */
import { reportBounds, shiftPeriod } from "@/features/reports/compute";
import type { Review } from "./types";

export type PeriodKind = "weekly" | "monthly";
export type Period = { kind: PeriodKind; start: string; end: string };

export function periodOf(kind: PeriodKind, date: string, weekStart: number): Period {
  return { kind, ...reportBounds(kind, date, weekStart) };
}

/** The current period and the `count - 1` before it, newest first. */
export function recentPeriods(kind: PeriodKind, today: string, weekStart: number, count = 4): Period[] {
  const out: Period[] = [];
  let p = periodOf(kind, today, weekStart);
  for (let i = 0; i < count; i++) {
    out.push(p);
    p = periodOf(kind, shiftPeriod(kind, p.start, -1), weekStart);
  }
  return out;
}

export function periodLabel(p: Period, locale: string): string {
  if (p.kind === "monthly") return new Date(`${p.start}T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const f = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(p.start)} – ${f(p.end)}`;
}

export const reviewFor = (reviews: Review[], p: Period) => reviews.find((r) => r.kind === p.kind && r.review_date === p.start) ?? null;

/**
 * Which review to suggest now: last period's while it's still missing early
 * in the new one (first 3 days of a week, first 7 of a month), otherwise the
 * current one.
 */
export function suggestedPeriod(kind: PeriodKind, reviews: Review[], today: string, weekStart: number): Period {
  const [current, previous] = recentPeriods(kind, today, weekStart, 2);
  const grace = kind === "weekly" ? 3 : 7;
  const daysIn = Math.round((Date.parse(today) - Date.parse(current.start)) / 86400000);
  return daysIn < grace && !reviewFor(reviews, previous) ? previous : current;
}
