/**
 * Habit reminders are ordinary `reminders` rows with a habit_id and a repeat
 * rule, so the existing sender (pg_cron → /api/cron/reminders → web push) and
 * the in-app notifier deliver them. This module holds the pure parts: which
 * days a habit reminds on, when the next one is, and whether today's (or this
 * week's) target is already met so a reminder would only nag.
 */
import { addDays, localDateKey, weekdayOf, zonedTimeToUtc } from "./dates";
import { iterate, parseRule, serializeRule, type Rule } from "./recurrence";

export type HabitScheduleLite = { cadence: "daily" | "weekly"; schedule_days: number[]; target_per_period: number };

/** Daily habits remind on their scheduled days; weekly ones every day until the week's target is met. */
export function habitReminderRule(h: Pick<HabitScheduleLite, "cadence" | "schedule_days">): string {
  const days = [...new Set(h.schedule_days)].sort((a, b) => a - b);
  if (h.cadence === "weekly" || days.length === 7) return serializeRule({ freq: "DAILY", interval: 1 });
  return serializeRule({ freq: "WEEKLY", interval: 1, byDay: days });
}

/** "HH:MM" from a Postgres time value like "07:30:00". */
export const wallTime = (t: string) => t.slice(0, 5);

/** The first reminder instant strictly after `after`, at `time` on a day the rule allows. */
export function nextHabitReminder(rule: string | Rule, time: string, tz: string, after: Date): Date | null {
  const r = typeof rule === "string" ? parseRule(rule) : rule;
  const start = localDateKey(after, tz);
  let n = 0;
  for (const k of iterate(r, start)) {
    const at = zonedTimeToUtc(k, wallTime(time), tz);
    if (at > after) return at;
    if (++n > 400) break;
  }
  return null;
}

const mondayOf = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7));

/**
 * Whether the habit's target is already met for the reminder's local day:
 * the day's count for daily habits, the Monday–Sunday total for weekly ones.
 */
export function habitTargetMet(h: HabitScheduleLite, logs: { log_date: string; count: number }[], dayKey: string): boolean {
  if (h.cadence === "daily") return logs.filter((l) => l.log_date === dayKey).reduce((a, l) => a + l.count, 0) >= h.target_per_period;
  const from = mondayOf(dayKey);
  const to = addDays(from, 6);
  return logs.filter((l) => l.log_date >= from && l.log_date <= to).reduce((a, l) => a + l.count, 0) >= h.target_per_period;
}
