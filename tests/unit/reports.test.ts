import { describe, expect, it } from "vitest";
import { computeReport, delta, periodLabel, reportBounds, shiftPeriod, type ReportInput } from "@/features/reports/compute";

const TZ = "Africa/Addis_Ababa";
const empty: ReportInput = {
  tasksDone: [], habits: [], habitLogs: [], focus: [], workouts: [], sleep: [], wellness: [], hydration: [], money: [],
  journalDates: [], goalsAchieved: [], milestonesDone: [], learningFinished: [], interactions: [],
};

describe("report periods", () => {
  it("finds the bounds of each period", () => {
    expect(reportBounds("daily", "2026-10-21")).toEqual({ start: "2026-10-21", end: "2026-10-21" });
    expect(reportBounds("weekly", "2026-10-21", 1)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(reportBounds("weekly", "2026-10-21", 0)).toEqual({ start: "2026-10-18", end: "2026-10-24" });
    expect(reportBounds("monthly", "2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(reportBounds("quarterly", "2026-11-05")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(reportBounds("annual", "2024-06-01")).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });
  it("steps between periods and labels them", () => {
    expect(shiftPeriod("monthly", "2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftPeriod("quarterly", "2026-10-01", 1)).toBe("2027-01-01");
    expect(shiftPeriod("weekly", "2026-10-19", -1)).toBe("2026-10-12");
    expect(periodLabel("quarterly", "2026-10-01", "2026-12-31", "en-US")).toBe("Q4 2026");
    expect(periodLabel("monthly", "2026-10-01", "2026-10-31", "en-US")).toBe("October 2026");
  });
});

describe("computeReport", () => {
  it("counts only what falls inside the period and stops at today", () => {
    const data: ReportInput = {
      ...empty,
      tasksDone: [
        { completed_on: "2026-10-19", due_date: "2026-10-20" },
        { completed_on: "2026-10-20", due_date: "2026-10-19" },
        { completed_on: "2026-10-21", due_date: null },
        { completed_on: "2026-10-12", due_date: null },
      ],
      habits: [{ id: "h", name: "Read", cadence: "daily", schedule_days: [1, 2, 3, 4, 5], target_per_period: 1, time_of_day: null, paused_at: null, created_at: "", source: "manual", created_on: "2026-10-01", paused_on: null }],
      habitLogs: [{ habit_id: "h", log_date: "2026-10-19", count: 1 }, { habit_id: "h", log_date: "2026-10-21", count: 1 }],
      focus: [{ date: "2026-10-20", project: "p1", minutes: 90 }, { date: "2026-10-20", project: null, minutes: 30 }],
      wellness: [{ log_date: "2026-10-20", mood: 4, energy: 3, stress: null }, { log_date: "2026-10-21", mood: 2, energy: null, stress: 4 }],
      hydration: [{ log_date: "2026-10-20", amount_ml: 1500 }, { log_date: "2026-10-21", amount_ml: 500 }, { log_date: "2026-10-21", amount_ml: 500 }],
      money: [
        { occurred_on: "2026-10-20", kind: "income", amount: "1000.00", currency: "ETB", is_pending: false },
        { occurred_on: "2026-10-20", kind: "expense", amount: "-250.50", currency: "ETB", is_pending: false },
        { occurred_on: "2026-10-21", kind: "expense", amount: "-20.00", currency: "USD", is_pending: false },
        { occurred_on: "2026-10-21", kind: "expense", amount: "-99.00", currency: "USD", is_pending: true },
      ],
      journalDates: ["2026-10-20", "2026-10-20", "2026-10-21"],
      interactions: ["2026-10-19"],
    };
    const r = computeReport(data, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    expect(r.through).toBe("2026-10-21");
    expect(r.days).toBe(3);
    expect(r.tasks).toEqual({ completed: 3, onTime: 1, late: 1, noDueDate: 1 });
    expect(r.habits).toEqual({ checkins: 2, scheduled: 3, kept: 2, rate: 67 });
    expect(r.focus.minutes).toBe(120);
    expect(r.focus.byProject[0]).toEqual({ project: "p1", minutes: 90 });
    expect(r.health).toMatchObject({ checkinDays: 2, mood: 3, energy: 3, stress: 4, waterDays: 2, waterAvgMl: 1250 });
    expect(r.money).toEqual([
      { currency: "ETB", income: { amount: "1000.00", currency: "ETB" }, expenses: { amount: "250.50", currency: "ETB" }, net: { amount: "749.50", currency: "ETB" } },
      { currency: "USD", income: { amount: "0.00", currency: "USD" }, expenses: { amount: "20.00", currency: "USD" }, net: { amount: "-20.00", currency: "USD" } },
    ]);
    expect(r.life.journalDays).toBe(2);
    expect(r.daysWithData).toBe(3);
  });
  it("doesn't count habit days before the habit existed or while paused", () => {
    const r = computeReport({
      ...empty,
      habits: [{ id: "h", name: "x", cadence: "daily", schedule_days: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, time_of_day: null, paused_at: null, created_at: "", source: "manual", created_on: "2026-10-03", paused_on: "2026-10-06" }],
    }, "weekly", "2026-10-01", "2026-10-07", "2026-10-31", TZ);
    expect(r.habits.scheduled).toBe(3);
    expect(r.habits.rate).toBe(0);
  });
  it("returns empty but honest numbers when nothing was logged", () => {
    const r = computeReport(empty, "daily", "2026-10-21", "2026-10-21", "2026-10-21", TZ);
    expect(r.habits.rate).toBeNull();
    expect(r.health.sleepAvgMinutes).toBeNull();
    expect(r.daysWithData).toBe(0);
    expect(delta(null, 3)).toBeNull();
    expect(delta(4.2, 3)).toBe(1.2);
  });
  it("counts projects, study, reading, meditation and reviews in the period", () => {
    const r = computeReport({
      ...empty,
      projectsCompleted: [{ completed_on: "2026-10-20", name: "Café rebrand" }, { completed_on: "2026-10-10", name: "Old" }],
      milestonesDone: ["2026-10-19", "2026-10-30"],
      study: [
        { date: "2026-10-19", minutes: 30, book: false, pages: 0 },
        { date: "2026-10-20", minutes: 20, book: true, pages: 12 },
        { date: "2026-10-20", minutes: 10, book: true, pages: 0 },
        { date: "2026-10-12", minutes: 99, book: true, pages: 50 },
      ],
      stepsDone: ["2026-10-21", "2026-10-01"],
      meditation: [{ date: "2026-10-19", minutes: 10 }, { date: "2026-10-19", minutes: 5 }, { date: "2026-10-21", minutes: 20 }],
      reviews: [{ date: "2026-10-19", kind: "weekly" }, { date: "2026-10-20", kind: "evening" }, { date: "2026-10-01", kind: "monthly" }],
      learningFinished: [{ finished_on: "2026-10-20", title: "Type book", book: true }, { finished_on: "2026-10-21", title: "Course" }],
    }, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    expect(r.work).toEqual({ projectsCompleted: ["Café rebrand"], milestones: 1 });
    expect(r.learning).toEqual({ minutes: 60, sessions: 3, days: 2, stepsDone: 1, finished: ["Course"] });
    expect(r.reflection).toEqual({
      meditationMinutes: 35, meditationSessions: 3, meditationDays: 2,
      readingMinutes: 30, readingDays: 1, pages: 12, booksFinished: ["Type book"],
      reviews: { evening: 1, weekly: 1, monthly: 0 },
    });
    expect(r.daysWithData).toBe(3);
  });
  it("tells never tracked apart from nothing this period", () => {
    const never = computeReport(empty, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    expect(Object.values(never.tracked).every((x) => x === false)).toBe(true);
    const quiet = computeReport({ ...empty, tracked: { meditation: true, reading: true } }, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    expect(quiet.tracked.meditation).toBe(true);
    expect(quiet.reflection.meditationMinutes).toBe(0);
    expect(quiet.tracked.projects).toBe(false);
    // Something logged in the period counts as tracked on its own.
    const here = computeReport({ ...empty, meditation: [{ date: "2026-10-20", minutes: 5 }] }, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    expect(here.tracked.meditation).toBe(true);
  });
});
