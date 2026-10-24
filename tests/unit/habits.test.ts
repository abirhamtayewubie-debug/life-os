import { describe, expect, it } from "vitest";
import { habitStats } from "@/features/habits/stats";
import type { HabitRecord } from "@/features/habits/types";

const habit = (p: Partial<HabitRecord>): HabitRecord => ({
  id: "h", name: "Read", cadence: "daily", schedule_days: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, time_of_day: "evening",
  paused_at: null, archived_at: null, description: null, goal_id: null, scheduled_time: null, reminder: null, created_at: "2026-09-01T00:00:00Z", source: "manual", ...p,
});
const log = (d: string, count = 1) => ({ habit_id: "h", log_date: d, count });

describe("habit stats", () => {
  it("weekly habits report progress for the current Monday-start week", () => {
    const h = habit({ cadence: "weekly", target_per_period: 3 });
    // 2026-10-21 is a Wednesday; Monday is the 19th.
    const s = habitStats(h, [log("2026-10-18"), log("2026-10-19"), log("2026-10-21", 2)], "2026-10-21", "UTC", "2026-09-01");
    expect(s.week).toEqual({ done: 3, target: 3 });
  });

  it("multi-count daily habits only count as done at the target", () => {
    const h = habit({ target_per_period: 2 });
    const s = habitStats(h, [log("2026-10-20", 1), log("2026-10-19", 2)], "2026-10-21", "UTC", "2026-09-01");
    const cells = s.history.flat();
    expect(cells.find((c) => c.date === "2026-10-20")).toMatchObject({ count: 1, done: false });
    expect(cells.find((c) => c.date === "2026-10-19")).toMatchObject({ count: 2, done: true });
    expect(s.streak).toBe(0); // yesterday not complete
  });

  it("history is 12 Monday-start weeks ending this week; future days marked", () => {
    const s = habitStats(habit({}), [], "2026-10-21", "UTC", "2026-09-01");
    expect(s.history).toHaveLength(12);
    expect(s.history[11][0].date).toBe("2026-10-19");
    expect(s.history[11][6]).toMatchObject({ date: "2026-10-25", future: true });
    expect(s.history[0][0].beforeStart).toBe(true);
    expect(s.total84).toBe(0);
  });
});
