import { describe, expect, it } from "vitest";
import {
  clock, convertUnit, hydrationByDay, metricSeries, preferredUnit, rangeFor, sleepInstants, sleepSummary, volumeByExercise, wellnessByDay, workoutSummary,
} from "@/features/health/metrics";

const TZ = "Africa/Addis_Ababa"; // UTC+3, no daylight saving

describe("units", () => {
  it("converts weight and length both ways and rounds to one decimal", () => {
    expect(convertUnit(80, "kg", "lb")).toBe(176.4);
    expect(convertUnit(176.4, "lb", "kg")).toBe(80);
    expect(convertUnit(32, "in", "cm")).toBe(81.3);
    expect(convertUnit(120, "bpm", "bpm")).toBe(120);
    expect(() => convertUnit(1, "kg", "cm")).toThrow();
  });
  it("picks display units and ranges per metric", () => {
    expect(preferredUnit("weight", "imperial")).toBe("lb");
    expect(preferredUnit("waist", "metric")).toBe("cm");
    expect(preferredUnit("resting_hr", "imperial")).toBe("bpm");
    expect(rangeFor("waist", "in")).toEqual([8, 120]);
    expect(rangeFor("blood_pressure_dia", "mmHg")).toEqual([30, 300]);
  });
});

describe("sleep", () => {
  it("puts an evening bedtime on the day before and an after-midnight one on the same day", () => {
    const a = sleepInstants("2026-10-12", "23:30", "06:45", TZ);
    expect(a.bedtime.toISOString()).toBe("2026-10-11T20:30:00.000Z");
    expect(a.wakeTime.toISOString()).toBe("2026-10-12T03:45:00.000Z");
    const b = sleepInstants("2026-10-12", "00:40", "07:00", TZ);
    expect(b.bedtime.toISOString()).toBe("2026-10-11T21:40:00.000Z");
  });
  it("averages bedtimes around midnight, not around noon", () => {
    const nights = [
      { sleep_date: "2026-10-10", bedtime: "2026-10-09T20:30:00Z", wake_time: "2026-10-10T03:30:00Z", duration_minutes: 420, quality: 4 },
      { sleep_date: "2026-10-11", bedtime: "2026-10-10T21:30:00Z", wake_time: "2026-10-11T03:30:00Z", duration_minutes: 360, quality: null },
      { sleep_date: "2026-10-12", bedtime: "2026-10-11T21:00:00Z", wake_time: "2026-10-12T04:00:00Z", duration_minutes: 420, quality: 2 },
    ];
    const s = sleepSummary(nights, TZ);
    expect(s.avgBedtime).toBe("00:00"); // 23:30, 00:30, 00:00 local
    expect(s.avgWake).toBe("06:40");
    expect(s.avgMinutes).toBe(400);
    expect(s.avgQuality).toBe(3);
    expect(s.bedtimeSpread).toBe(20);
    expect(s.shortest?.sleep_date).toBe("2026-10-11");
    expect(sleepSummary([], TZ).avgMinutes).toBeNull();
    expect(clock(1470)).toBe("00:30");
  });
});

describe("wellness, hydration and workouts", () => {
  it("averages check-ins per day and leaves empty days empty", () => {
    const days = wellnessByDay([
      { log_date: "2026-10-01", logged_at: "", mood: 4, energy: 3, stress: null },
      { log_date: "2026-10-01", logged_at: "", mood: 2, energy: null, stress: 4 },
    ], "2026-10-01", "2026-10-02");
    expect(days).toEqual([
      { date: "2026-10-01", mood: 3, energy: 3, stress: 4, checkins: 2 },
      { date: "2026-10-02", mood: null, energy: null, stress: null, checkins: 0 },
    ]);
    expect(hydrationByDay([{ log_date: "2026-10-01", amount_ml: 250 }, { log_date: "2026-10-01", amount_ml: 500 }], "2026-10-01", "2026-10-01")).toEqual([{ date: "2026-10-01", ml: 750 }]);
  });
  it("summarises workouts in a range without inventing durations", () => {
    const s = workoutSummary([
      { performed_on: "2026-10-01", activity: "Run", duration_minutes: 30, perceived_effort: 6 },
      { performed_on: "2026-10-01", activity: "run ", duration_minutes: null, perceived_effort: null },
      { performed_on: "2026-10-03", activity: "Strength", duration_minutes: 45, perceived_effort: 8 },
      { performed_on: "2026-09-30", activity: "Run", duration_minutes: 60, perceived_effort: 5 },
    ], "2026-10-01", "2026-10-07");
    expect(s).toMatchObject({ sessions: 3, activeDays: 2, minutes: 75, untimed: 1, avgEffort: 7 });
    expect(s.byActivity[0]).toEqual({ activity: "Run", sessions: 2, minutes: 30 });
  });
  it("adds up lifting volume in one unit", () => {
    expect(volumeByExercise([
      { exercise: "Squat", reps: 5, weight: "100", weight_unit: "kg" },
      { exercise: "squat", reps: 5, weight: "220.5", weight_unit: "lb" },
      { exercise: "Plank", reps: null, weight: null, weight_unit: null },
    ], "kg")).toEqual([{ exercise: "Squat", sets: 2, volume: 1000 }, { exercise: "Plank", sets: 1, volume: 0 }]);
  });
  it("charts a metric in the display unit and reports the change", () => {
    const s = metricSeries([
      { measured_at: "2026-10-05T06:00:00Z", metric: "weight", value: "79.0", unit: "kg" },
      { measured_at: "2026-10-01T06:00:00Z", metric: "weight", value: "178.6", unit: "lb" },
      { measured_at: "2026-10-01T06:00:00Z", metric: "waist", value: "86", unit: "cm" },
    ], "weight", "kg");
    expect(s.points.map((p) => p.value)).toEqual([81, 79]);
    expect(s.latest).toBe(79);
    expect(s.change).toBe(-2);
  });
});
