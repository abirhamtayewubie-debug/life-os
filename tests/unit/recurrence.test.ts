import { describe, expect, it } from "vitest";
import { zonedTimeToUtc } from "@/lib/dates";
import { describeRule, isValidRule, nextOccurrence, occurrencesBetween, parseRule, presetFromRule, ruleFromPreset, serializeRule } from "@/lib/recurrence";

describe("recurrence parsing", () => {
  it("round-trips supported rules", () => {
    for (const s of ["FREQ=DAILY", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", "FREQ=MONTHLY;BYMONTHDAY=31", "FREQ=YEARLY;COUNT=3", "FREQ=DAILY;UNTIL=20261231"]) {
      expect(serializeRule(parseRule(s))).toBe(s);
    }
  });

  it("rejects what it doesn't understand instead of guessing", () => {
    for (const s of ["", "FREQ=HOURLY", "FREQ=DAILY;BYHOUR=9", "FREQ=DAILY;BYDAY=MO", "FREQ=WEEKLY;BYDAY=XX", "FREQ=DAILY;COUNT=2;UNTIL=20261231", "FREQ=DAILY;INTERVAL=0"]) {
      expect(isValidRule(s), s).toBe(false);
    }
  });
});

describe("occurrences", () => {
  it("daily with interval", () => {
    expect(occurrencesBetween(parseRule("FREQ=DAILY;INTERVAL=3"), "2026-10-30", "2026-10-30", "2026-11-08")).toEqual(["2026-10-30", "2026-11-02", "2026-11-05", "2026-11-08"]);
  });

  it("weekdays skip weekends", () => {
    expect(occurrencesBetween(parseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"), "2026-10-23", "2026-10-23", "2026-10-28")).toEqual(["2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28"]);
  });

  it("every other week on two days", () => {
    expect(occurrencesBetween(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"), "2026-10-19", "2026-10-19", "2026-11-05")).toEqual(["2026-10-19", "2026-10-22", "2026-11-02", "2026-11-05"]);
  });

  it("monthly on the 31st skips short months", () => {
    expect(occurrencesBetween(parseRule("FREQ=MONTHLY;BYMONTHDAY=31"), "2026-10-31", "2026-10-31", "2027-03-31")).toEqual(["2026-10-31", "2026-12-31", "2027-01-31", "2027-03-31"]);
  });

  it("yearly on Feb 29 only lands in leap years", () => {
    expect(occurrencesBetween(parseRule("FREQ=YEARLY"), "2028-02-29", "2028-01-01", "2033-12-31")).toEqual(["2028-02-29", "2032-02-29"]);
  });

  it("respects COUNT and UNTIL", () => {
    expect(occurrencesBetween(parseRule("FREQ=DAILY;COUNT=3"), "2026-10-21", "2026-10-01", "2026-12-31")).toHaveLength(3);
    expect(occurrencesBetween(parseRule("FREQ=DAILY;UNTIL=20261023"), "2026-10-21", "2026-10-01", "2026-12-31")).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(nextOccurrence(parseRule("FREQ=DAILY;COUNT=2"), "2026-10-21", "2026-10-22")).toBeNull();
  });

  it("finds the next occurrence after a completed one", () => {
    expect(nextOccurrence(parseRule("FREQ=WEEKLY;BYDAY=FR"), "2026-10-23", "2026-10-23")).toBe("2026-10-30");
    expect(nextOccurrence(parseRule("FREQ=MONTHLY;BYMONTHDAY=15"), "2026-01-15", "2026-10-21")).toBe("2026-11-15");
  });

  it("keeps wall-clock time across DST when placed in a zone", () => {
    const dates = occurrencesBetween(parseRule("FREQ=WEEKLY;BYDAY=MO"), "2026-10-26", "2026-10-26", "2026-11-02");
    const utc = dates.map((d) => zonedTimeToUtc(d, "09:00", "America/Toronto").toISOString());
    expect(utc).toEqual(["2026-10-26T13:00:00.000Z", "2026-11-02T14:00:00.000Z"]); // EDT → EST
  });
});

describe("presets and descriptions", () => {
  it("builds rules from the start date", () => {
    expect(ruleFromPreset("weekly", "2026-10-21")).toBe("FREQ=WEEKLY;BYDAY=WE");
    expect(ruleFromPreset("monthly", "2026-10-21")).toBe("FREQ=MONTHLY;BYMONTHDAY=21");
    expect(presetFromRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")).toBe("weekdays");
    expect(presetFromRule("FREQ=DAILY;COUNT=5")).toBe("custom");
  });

  it("describes rules in plain words", () => {
    expect(describeRule(parseRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"))).toBe("Every weekday");
    expect(describeRule(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"))).toBe("Every 2 weeks on Mon");
  });
});
