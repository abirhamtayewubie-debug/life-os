import { describe, expect, it, vi } from "vitest";
import { habitTargetMet, habitReminderRule, nextHabitReminder } from "@/lib/habit-reminder";
import { habitStats } from "@/features/habits/stats";
import type { HabitRecord } from "@/features/habits/types";

const TZ = "Africa/Addis_Ababa"; // UTC+3, no DST

describe("habit reminder schedule", () => {
  it("reminds on the habit's days", () => {
    expect(habitReminderRule({ cadence: "daily", schedule_days: [0, 1, 2, 3, 4, 5, 6] })).toBe("FREQ=DAILY");
    expect(habitReminderRule({ cadence: "daily", schedule_days: [5, 1, 3] })).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(habitReminderRule({ cadence: "weekly", schedule_days: [1] })).toBe("FREQ=DAILY");
  });

  it("finds the next time on an allowed day, in the person's time zone", () => {
    // Saturday 2026-10-24 09:00 local = 06:00Z.
    const now = new Date("2026-10-24T06:00:00Z");
    expect(nextHabitReminder("FREQ=DAILY", "07:30", TZ, now)?.toISOString()).toBe("2026-10-25T04:30:00.000Z");
    expect(nextHabitReminder("FREQ=DAILY", "21:00", TZ, now)?.toISOString()).toBe("2026-10-24T18:00:00.000Z");
    // Mon/Wed/Fri at 07:00 → Monday.
    expect(nextHabitReminder("FREQ=WEEKLY;BYDAY=MO,WE,FR", "07:00:00", TZ, now)?.toISOString()).toBe("2026-10-26T04:00:00.000Z");
  });

  it("is strictly after the given moment, so advancing never repeats an occurrence", () => {
    const at = new Date("2026-10-24T18:00:00Z");
    expect(nextHabitReminder("FREQ=DAILY", "21:00", TZ, at)?.toISOString()).toBe("2026-10-25T18:00:00.000Z");
  });

  it("knows when the target is already met", () => {
    const daily = { cadence: "daily" as const, schedule_days: [0, 1, 2, 3, 4, 5, 6], target_per_period: 2 };
    expect(habitTargetMet(daily, [{ log_date: "2026-10-24", count: 1 }], "2026-10-24")).toBe(false);
    expect(habitTargetMet(daily, [{ log_date: "2026-10-24", count: 2 }], "2026-10-24")).toBe(true);
    const weekly = { cadence: "weekly" as const, schedule_days: [0, 1, 2, 3, 4, 5, 6], target_per_period: 3 };
    // Week of Monday 2026-10-19; the Sunday before doesn't count.
    const logs = [{ log_date: "2026-10-18", count: 1 }, { log_date: "2026-10-19", count: 1 }, { log_date: "2026-10-22", count: 1 }];
    expect(habitTargetMet(weekly, logs, "2026-10-24")).toBe(false);
    expect(habitTargetMet(weekly, [...logs, { log_date: "2026-10-23", count: 1 }], "2026-10-24")).toBe(true);
  });
});

describe("weekly completion rates", () => {
  const habit = (p: Partial<HabitRecord>): HabitRecord => ({
    id: "h", name: "Read", cadence: "daily", schedule_days: [1, 3, 5], target_per_period: 1, time_of_day: "evening",
    paused_at: null, archived_at: null, description: null, goal_id: null, scheduled_time: null, reminder: null,
    created_at: "2026-10-12T00:00:00Z", source: "manual", ...p,
  });
  const log = (d: string, count = 1) => ({ habit_id: "h", log_date: d, count });

  it("counts scheduled days done, and leaves weeks before the habit as no data", () => {
    // Today Sat 2026-10-24. Week of Oct 12: Mon, Wed done of Mon/Wed/Fri. Week of Oct 19: all three.
    const s = habitStats(habit({}), [log("2026-10-12"), log("2026-10-14"), log("2026-10-19"), log("2026-10-21"), log("2026-10-23")], "2026-10-24", "UTC", "2026-10-12");
    expect(s.weekly).toHaveLength(12);
    expect(s.weekly.at(-1)).toEqual({ start: "2026-10-19", pct: 100 });
    expect(s.weekly.at(-2)).toEqual({ start: "2026-10-12", pct: 67 });
    expect(s.weekly.at(-3)!.pct).toBeNull();
  });

  it("caps weekly habits at their target", () => {
    const s = habitStats(habit({ cadence: "weekly", target_per_period: 2 }), [log("2026-10-19", 3)], "2026-10-24", "UTC", "2026-10-12");
    expect(s.weekly.at(-1)!.pct).toBe(100);
    expect(s.weekly.at(-2)!.pct).toBe(0);
  });
});

vi.mock("server-only", () => ({}));

/** Just enough of the Supabase query builder for settleHabitReminders. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const updates: { id: unknown; prev: unknown; row: Record<string, unknown> }[] = [];
  const from = (table: string) => ({
    select: () => {
      const q = { data: tables[table], error: null, in: () => q, gte: () => q };
      return q;
    },
    update: (row: Record<string, unknown>) => ({
      eq: (_c: string, id: unknown) => ({ eq: (_c2: string, prev: unknown) => { updates.push({ id, prev, row }); return Promise.resolve({ error: null }); } }),
    }),
  });
  return { db: { from } as never, updates };
}

describe("settling due habit reminders", () => {
  const habitRow = { id: "h", cadence: "daily", schedule_days: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, scheduled_time: "21:00:00", paused_at: null, archived_at: null };
  const due = { id: "r", remind_at: "2026-10-24T18:00:00.000Z", snoozed_until: null, timezone: TZ, recurrence_rule: "FREQ=DAILY", habit_id: "h" };
  const now = new Date("2026-10-24T18:00:30Z");

  it("sends when not yet done and moves to tomorrow", async () => {
    const { settleHabitReminders } = await import("@/server/notify/habit-reminders");
    const { db, updates } = fakeDb({ habits: [habitRow], habit_logs: [] });
    const quiet = await settleHabitReminders(db, [due], now);
    expect(quiet.has("r")).toBe(false);
    expect(updates).toEqual([{ id: "r", prev: due.remind_at, row: expect.objectContaining({ remind_at: "2026-10-25T18:00:00.000Z" }) }]);
  });

  it("stays quiet when today is already logged, or the habit is paused, but still moves on", async () => {
    const { settleHabitReminders } = await import("@/server/notify/habit-reminders");
    const logged = fakeDb({ habits: [habitRow], habit_logs: [{ habit_id: "h", log_date: "2026-10-24", count: 1 }] });
    expect((await settleHabitReminders(logged.db, [due], now)).has("r")).toBe(true);
    expect(logged.updates).toHaveLength(1);
    const paused = fakeDb({ habits: [{ ...habitRow, paused_at: "2026-10-20T00:00:00Z" }], habit_logs: [] });
    expect((await settleHabitReminders(paused.db, [due], now)).has("r")).toBe(true);
  });

  it("only moves the reminders the caller may advance, but still reports quiet ones", async () => {
    const { settleHabitReminders } = await import("@/server/notify/habit-reminders");
    const { db, updates } = fakeDb({ habits: [habitRow], habit_logs: [{ habit_id: "h", log_date: "2026-10-24", count: 1 }] });
    const quiet = await settleHabitReminders(db, [{ ...due, channels: ["in_app", "web_push"] }], now, (r) => !r.channels?.includes("web_push"));
    expect(quiet.has("r")).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("leaves other reminders alone", async () => {
    const { settleHabitReminders } = await import("@/server/notify/habit-reminders");
    const { db, updates } = fakeDb({ habits: [], habit_logs: [] });
    expect((await settleHabitReminders(db, [{ ...due, habit_id: null }], now)).size).toBe(0);
    expect(updates).toHaveLength(0);
  });
});
