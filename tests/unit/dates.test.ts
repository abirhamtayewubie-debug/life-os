import { describe, expect, it } from "vitest";
import { addDays, diffDays, greetingFor, isValidTimeZone, localDateKey, relativeDay, weekdayOf, zonedTimeToUtc } from "@/lib/dates";

describe("dates", () => {
  it("derives the local date in the user's zone, not the server's", () => {
    const instant = new Date("2026-10-21T22:30:00Z");
    expect(localDateKey(instant, "UTC")).toBe("2026-10-21");
    expect(localDateKey(instant, "Africa/Addis_Ababa")).toBe("2026-10-22"); // UTC+3
    expect(localDateKey(instant, "America/Vancouver")).toBe("2026-10-21");
  });

  it("does calendar arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31"); // US DST ends Nov 1 2026
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2); // across US spring-forward
  });

  it("converts local wall time to UTC, including DST", () => {
    expect(zonedTimeToUtc("2026-10-21", "09:00", "Africa/Addis_Ababa").toISOString()).toBe("2026-10-21T06:00:00.000Z");
    expect(zonedTimeToUtc("2026-07-01", "09:00", "America/Toronto").toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT
    expect(zonedTimeToUtc("2026-12-01", "09:00", "America/Toronto").toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST
  });

  it("knows weekdays and relative labels", () => {
    expect(weekdayOf("2026-10-21")).toBe(3); // Wednesday
    expect(relativeDay("2026-10-22", "2026-10-21")).toBe("tomorrow");
    expect(relativeDay("2026-10-18", "2026-10-21")).toBe("3 days ago");
  });

  it("greets by local hour", () => {
    expect(greetingFor(new Date("2026-10-21T05:00:00Z"), "Africa/Addis_Ababa")).toBe("Good morning"); // 08:00
    expect(greetingFor(new Date("2026-10-21T12:00:00Z"), "Africa/Addis_Ababa")).toBe("Good afternoon"); // 15:00
    expect(greetingFor(new Date("2026-10-21T17:00:00Z"), "Africa/Addis_Ababa")).toBe("Good evening"); // 20:00
  });

  it("validates IANA zones", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
