import { describe, expect, it } from "vitest";
import { minutesBetween, minutesByWeek, mondayOf, nextStep, nextStudyDay, planLabel, plannedWeekMinutes, roadmapProgress, studyStreak } from "@/features/learning/plan";

const step = (position: number, done = false) => ({ id: `s${position}`, position, done_at: done ? "2026-10-01T10:00:00Z" : null });

describe("learning plan", () => {
  it("finds Monday of the week", () => {
    expect(mondayOf("2026-10-24")).toBe("2026-10-19"); // Saturday
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // Sunday ends the week
  });

  it("counts roadmap progress and the next step in order", () => {
    expect(roadmapProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
    const steps = [step(3), step(1, true), step(2)];
    expect(roadmapProgress(steps)).toEqual({ done: 1, total: 3, pct: 33 });
    expect(nextStep(steps)?.id).toBe("s2");
    expect(nextStep([step(1, true)])).toBeNull();
  });

  it("describes a study plan", () => {
    expect(planLabel({ study_days: [], study_time: "19:00:00", study_minutes: 30 })).toBeNull();
    expect(planLabel({ study_days: [5, 1, 3], study_time: "19:00:00", study_minutes: 30 })).toBe("Mon, Wed, Fri at 19:00 · 30 min");
    expect(planLabel({ study_days: [0, 1, 2, 3, 4, 5, 6], study_time: null, study_minutes: null })).toBe("Every day");
    expect(planLabel({ study_days: [0], study_time: null, study_minutes: 45 })).toBe("Sun · 45 min");
    expect(plannedWeekMinutes({ study_days: [1, 3], study_minutes: 30 })).toBe(60);
    expect(plannedWeekMinutes({ study_days: [1, 3], study_minutes: null })).toBeNull();
  });

  it("finds the next study day, today included", () => {
    expect(nextStudyDay([], "2026-10-24")).toBeNull();
    expect(nextStudyDay([6], "2026-10-24")).toBe("2026-10-24");
    expect(nextStudyDay([1, 3], "2026-10-24")).toBe("2026-10-26");
  });

  it("totals minutes by range and by week", () => {
    const sessions = [
      { studied_on: "2026-10-24", minutes: 20 },
      { studied_on: "2026-10-19", minutes: 30 },
      { studied_on: "2026-10-18", minutes: 40 },
      { studied_on: "2026-10-05", minutes: 10 },
    ];
    expect(minutesBetween(sessions, "2026-10-19", "2026-10-25")).toBe(50);
    const weeks = minutesByWeek(sessions, "2026-10-24", 3);
    expect(weeks).toEqual([
      { start: "2026-10-05", minutes: 10 },
      { start: "2026-10-12", minutes: 40 },
      { start: "2026-10-19", minutes: 50 },
    ]);
  });

  it("counts a streak without breaking on today", () => {
    const days = (...d: string[]) => d.map((studied_on) => ({ studied_on }));
    expect(studyStreak(days("2026-10-24", "2026-10-23", "2026-10-21"), "2026-10-24")).toBe(2);
    expect(studyStreak(days("2026-10-23", "2026-10-22"), "2026-10-24")).toBe(2);
    expect(studyStreak(days("2026-10-22"), "2026-10-24")).toBe(0);
    expect(studyStreak([], "2026-10-24")).toBe(0);
  });
});
