import { addDays } from "@/lib/dates";

/** Days in the last `window` days (ending today) with at least one entry. */
export function daysWritten(dates: string[], todayKey: string, window = 30): number {
  const from = addDays(todayKey, -(window - 1));
  return new Set(dates.filter((d) => d >= from && d <= todayKey)).size;
}

/** Consecutive days with an entry, ending today (or yesterday if nothing yet today). */
export function writingStreak(dates: string[], todayKey: string): number {
  const set = new Set(dates);
  let k = set.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (set.has(k) && n < 3660) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}
