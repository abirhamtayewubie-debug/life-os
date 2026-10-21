import { addDays, weekdayOf } from "@/lib/dates";
import { computeHabit, isScheduled, type HabitView } from "@/features/dashboard/compute";
import type { RawHabitLog } from "@/features/dashboard/types";
import type { HabitRecord } from "./types";

export type HabitCell = { date: string; count: number; scheduled: boolean; done: boolean; future: boolean; beforeStart: boolean };

export type HabitStats = HabitView & {
  week: { done: number; target: number } | null;
  /** 12 weeks (Monday-start) of cells, oldest first, for the history strip. */
  history: HabitCell[][];
  total84: number;
};

const mondayOf = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7));

export function habitStats(h: HabitRecord, logs: RawHabitLog[], todayKey: string, tz: string, createdKey: string): HabitStats {
  const base = computeHabit(h, logs, todayKey, tz);
  const byDate = new Map<string, number>();
  for (const l of logs) if (l.habit_id === h.id) byDate.set(l.log_date, (byDate.get(l.log_date) ?? 0) + l.count);
  const dailyTarget = h.cadence === "daily" ? h.target_per_period : 1;

  const thisMonday = mondayOf(todayKey);
  let week: HabitStats["week"] = null;
  if (h.cadence === "weekly") {
    let done = 0;
    for (let i = 0; i < 7; i++) done += byDate.get(addDays(thisMonday, i)) ?? 0;
    week = { done, target: h.target_per_period };
  }

  const history: HabitCell[][] = [];
  let total84 = 0;
  for (let w = 11; w >= 0; w--) {
    const start = addDays(thisMonday, -7 * w);
    const col: HabitCell[] = [];
    for (let d = 0; d < 7; d++) {
      const k = addDays(start, d);
      const count = byDate.get(k) ?? 0;
      if (k <= todayKey) total84 += count;
      col.push({ date: k, count, scheduled: isScheduled(h, k), done: count >= dailyTarget, future: k > todayKey, beforeStart: k < createdKey });
    }
    history.push(col);
  }
  return { ...base, week, history, total84 };
}
