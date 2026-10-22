import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activityName, AppleHealthReader, appleDate } from "@/lib/apple-health";

const AA = "Africa/Addis_Ababa";
const xml = readFileSync(new URL("../fixtures/apple-health-export.xml", import.meta.url), "utf8");

function read(chunkSize: number, since: Date | null = new Date("2026-01-01T00:00:00Z")) {
  const r = new AppleHealthReader(AA, since);
  for (let i = 0; i < xml.length; i += chunkSize) r.feed(xml.slice(i, i + chunkSize));
  return r.finish();
}

describe("Apple Health export", () => {
  it("parses Apple's date format", () => {
    expect(appleDate("2026-10-01 07:00:00 +0300")?.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(appleDate("2026-10-01T07:00:00Z")).toBeNull();
  });

  it("names workout types readably", () => {
    expect(activityName("HKWorkoutActivityTypeRunning")).toBe("Running");
    expect(activityName("HKWorkoutActivityTypeTraditionalStrengthTraining")).toBe("Strength training");
    expect(activityName("HKWorkoutActivityTypeCrossCountrySkiing")).toBe("Cross country skiing");
  });

  it("keeps measurements as recorded, converting only Apple's fraction for body fat", () => {
    const r = read(1 << 20);
    expect(r.measurements).toEqual([
      { metric: "weight", measuredAt: "2026-10-01T04:00:00.000Z", value: 72.4, unit: "kg", typedIn: true },
      { metric: "weight", measuredAt: "2026-10-08T04:00:00.000Z", value: 159.2, unit: "lb", typedIn: false },
      { metric: "body_fat_pct", measuredAt: "2026-10-08T04:00:00.000Z", value: 21.3, unit: "%", typedIn: false },
      { metric: "resting_hr", measuredAt: "2026-10-09T21:01:00.000Z", value: 58, unit: "bpm", typedIn: false },
    ]);
    expect(r.skipped).toEqual(expect.arrayContaining([{ reason: "Values outside the range this app accepts", count: 1 }]));
  });

  it("turns sleep samples into one night per wake-up day, preferring asleep time over time in bed", () => {
    const { nights, skipped } = read(1 << 20);
    expect(nights).toEqual([
      // Watch stages: asleep 23:00 → 06:30 with one awake spell; the phone's in-bed span is ignored.
      { sleepDate: "2026-10-11", bedtime: "2026-10-10T20:00:00.000Z", wakeTime: "2026-10-11T03:30:00.000Z", awakenings: 1, typedIn: false },
      // Only time in bed is known that night.
      { sleepDate: "2026-10-12", bedtime: "2026-10-11T20:15:00.000Z", wakeTime: "2026-10-12T04:00:00.000Z", awakenings: null, typedIn: false },
    ]);
    expect(skipped).toEqual(expect.arrayContaining([{ reason: "Naps and sleep under an hour", count: 1 }]));
  });

  it("reads workouts with their totals, in new and old export styles", () => {
    const { workouts, skipped } = read(1 << 20);
    expect(workouts).toEqual([
      { externalId: "apple-health:HKWorkoutActivityTypeRunning:2026-10-12T15:05:00.000Z", activity: "Running", performedOn: "2026-10-12", startedAt: "2026-10-12T15:05:00.000Z", durationMinutes: 32, notes: "Apple Health: 5.12 km · 312 kcal · from Ab’s Apple Watch", typedIn: false },
      { externalId: "apple-health:HKWorkoutActivityTypeTraditionalStrengthTraining:2026-10-13T04:00:00.000Z", activity: "Strength training", performedOn: "2026-10-13", startedAt: "2026-10-13T04:00:00.000Z", durationMinutes: 45, notes: "Apple Health: 210 kcal · from Health", typedIn: true },
    ]);
    expect(skipped).toEqual(expect.arrayContaining([{ reason: "Workouts shorter than a minute or longer than a day", count: 1 }]));
  });

  it("gives the same result however the file is split, and respects the start date", () => {
    const whole = read(1 << 20);
    expect(read(7)).toEqual(whole);
    expect(read(97)).toEqual(whole);
    expect(whole.range).toEqual({ from: "2026-10-01", to: "2026-10-13" });
    const all = read(1 << 20, null);
    expect(all.measurements).toHaveLength(5);
    expect(all.range?.from).toBe("2024-01-01");
  });
});
