import { describe, expect, it } from "vitest";
import { estimatedMax, exerciseList, exerciseProgress, lastSetFor, recordsByWorkout, recordsFor, type LoggedSet } from "@/features/health/records";
import { programDays } from "@/features/health/types";

let n = 0;
const set = (workout_id: string, date: string, exercise: string, reps: number | null, weight: number | null, unit: "kg" | "lb" = "kg", extra: Partial<LoggedSet> = {}): LoggedSet => ({
  workout_id, date, exercise, set_number: ++n, reps, weight: weight === null ? null : weight.toFixed(2), weight_unit: weight === null ? null : unit,
  distance_m: null, duration_seconds: null, ...extra,
});

const log: LoggedSet[] = [
  set("w1", "2026-10-01", "Squat", 8, 60), set("w1", "2026-10-01", "Squat", 8, 60), set("w1", "2026-10-01", "Push-up", 15, null),
  set("w2", "2026-10-08", "squat ", 8, 62.5), set("w2", "2026-10-08", "Squat", 6, 65), set("w2", "2026-10-08", "Push-up", 18, null),
  set("w3", "2026-10-15", "Squat", 10, 62.5), set("w3", "2026-10-15", "Push-up", 16, null),
];

describe("workout records", () => {
  it("estimates a one-rep max only from sensible rep counts", () => {
    expect(estimatedMax(100, 1)).toBe(100);
    expect(estimatedMax(60, 10)).toBeCloseTo(80);
    expect(estimatedMax(60, 20)).toBeNull();
  });

  it("groups exercise spellings and ranks by sessions", () => {
    expect(exerciseList(log).map((e) => e.key).sort()).toEqual(["push-up", "squat"]);
    expect(exerciseList(log).find((e) => e.key === "squat")).toMatchObject({ sessions: 3, lastDate: "2026-10-15" });
  });

  it("finds the heaviest set, best estimated max, most reps and best session", () => {
    const r = recordsFor(log, "squat", "kg");
    expect(r.heaviest).toMatchObject({ value: 65, date: "2026-10-08" });
    expect(r.estimatedMax).toMatchObject({ value: 83.5, date: "2026-10-15" }); // 62.5 × (1 + 10/30)
    expect(r.mostReps).toMatchObject({ value: 10, date: "2026-10-15" });
    expect(r.bestSession).toMatchObject({ value: 960, date: "2026-10-01" }); // 2 × 8 × 60
  });

  it("converts units so pounds and kilograms compare", () => {
    const mixed = [set("a", "2026-10-01", "Bench", 5, 60), set("b", "2026-10-02", "Bench", 5, 140, "lb")];
    expect(recordsFor(mixed, "bench", "kg").heaviest).toMatchObject({ value: 63.5, date: "2026-10-02" });
  });

  it("charts one point per workout", () => {
    const p = exerciseProgress(log, "squat", "kg");
    expect(p.map((x) => [x.date, x.top, x.sets])).toEqual([["2026-10-01", 60, 2], ["2026-10-08", 65, 2], ["2026-10-15", 62.5, 1]]);
  });

  it("flags new records against earlier workouts only, never the first one", () => {
    const prs = recordsByWorkout(log, "kg");
    expect(prs.has("w1")).toBe(false);
    expect(prs.get("w2")).toEqual(["Squat 65 kg", "Push-up 18 reps"]);
    expect(prs.get("w3")).toEqual(["Squat est. max 83.5 kg"]);
  });

  it("suggests the top set of the last session", () => {
    expect(lastSetFor(log, "SQUAT")).toMatchObject({ date: "2026-10-15", weight: "62.50" });
    expect(lastSetFor(log, "Deadlift")).toBeNull();
  });

  it("keeps program days in the order they were written", () => {
    const ex = (day_label: string, position: number) => ({ id: String(position), day_label, position, exercise: "x", target_sets: 3, reps_min: null, reps_max: null, target_weight: null, weight_unit: null, rest_seconds: null, notes: null });
    expect(programDays({ exercises: [ex("Push", 1), ex("Push", 2), ex("Pull", 3), ex("Legs", 4)] }).map((d) => [d.label, d.exercises.length])).toEqual([["Push", 2], ["Pull", 1], ["Legs", 1]]);
  });
});
