import { describe, expect, it } from "vitest";
import { fromGoogle, googleIdFor, googleRule, lifeOsIdFrom, localWins, sameFields, skipType, toGoogle, type LocalEvent } from "@/lib/google-calendar";

const local = (over: Partial<LocalEvent> = {}): LocalEvent => ({
  id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  title: "Site visit",
  description: null,
  location: null,
  all_day: false,
  starts_at: "2026-10-24T06:00:00.000Z",
  ends_at: "2026-10-24T07:30:00.000Z",
  timezone: "Africa/Addis_Ababa",
  recurrence_rule: null,
  ...over,
});

describe("Google event ids", () => {
  it("round-trips a Life OS id through a valid Google id", () => {
    const g = googleIdFor(local().id);
    expect(g).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(lifeOsIdFrom(g)).toBe(local().id);
  });

  it("doesn't mistake Google's own ids for Life OS ones", () => {
    expect(lifeOsIdFrom("7kq3n1c2v0abcd")).toBeNull();
    expect(lifeOsIdFrom(`${googleIdFor(local().id)}_20261024T060000Z`)).toBeNull();
  });
});

describe("fromGoogle", () => {
  it("reads a timed event in UTC and keeps its zone", () => {
    expect(fromGoogle({ id: "a", summary: " Call ", start: { dateTime: "2026-10-24T09:00:00+03:00", timeZone: "Africa/Addis_Ababa" }, end: { dateTime: "2026-10-24T09:30:00+03:00" } }, "UTC")).toEqual({
      title: "Call", description: null, location: null, all_day: false,
      starts_at: "2026-10-24T06:00:00.000Z", ends_at: "2026-10-24T06:30:00.000Z", timezone: "Africa/Addis_Ababa",
    });
  });

  it("turns Google's exclusive all-day end into Life OS's last day", () => {
    const one = fromGoogle({ id: "a", summary: "Holiday", start: { date: "2026-10-24" }, end: { date: "2026-10-25" } }, "Africa/Addis_Ababa");
    expect(one).toMatchObject({ all_day: true, starts_at: "2026-10-24T00:00:00.000Z", ends_at: "2026-10-24T00:00:00.000Z", timezone: "Africa/Addis_Ababa" });
    const three = fromGoogle({ id: "b", start: { date: "2026-10-24" }, end: { date: "2026-10-27" } }, "UTC");
    expect(three).toMatchObject({ title: "(No title)", ends_at: "2026-10-26T00:00:00.000Z" });
  });

  it("trims text to the column limits and skips events without a time", () => {
    const long = fromGoogle({ id: "a", summary: "x".repeat(400), location: "y".repeat(400), start: { dateTime: "2026-10-24T06:00:00Z" }, end: { dateTime: "2026-10-24T06:00:00Z" } }, "UTC")!;
    expect(long.title).toHaveLength(300);
    expect(long.location).toHaveLength(300);
    expect(fromGoogle({ id: "c", status: "confirmed" }, "UTC")).toBeNull();
  });

  it("skips working-location markers", () => {
    expect(skipType({ id: "a", eventType: "workingLocation" })).toBe(true);
    expect(skipType({ id: "a", eventType: "default" })).toBe(false);
  });
});

describe("toGoogle", () => {
  it("sends timed events with their zone", () => {
    expect(toGoogle(local({ location: "Bole" }))).toEqual({
      summary: "Site visit", description: "", location: "Bole",
      start: { dateTime: "2026-10-24T06:00:00.000Z", timeZone: "Africa/Addis_Ababa" },
      end: { dateTime: "2026-10-24T07:30:00.000Z", timeZone: "Africa/Addis_Ababa" },
    });
  });

  it("sends all-day events with Google's day-after end", () => {
    const body = toGoogle(local({ all_day: true, starts_at: "2026-10-24T00:00:00.000Z", ends_at: "2026-10-25T00:00:00.000Z" }));
    expect(body.start).toEqual({ date: "2026-10-24" });
    expect(body.end).toEqual({ date: "2026-10-26" });
  });

  it("converts repeat rules, with a timed end date for timed events", () => {
    expect(toGoogle(local({ recurrence_rule: "FREQ=WEEKLY;BYDAY=MO,WE" })).recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]);
    expect(googleRule("FREQ=DAILY;UNTIL=20261130", false)).toBe("RRULE:FREQ=DAILY;UNTIL=20261130T235959Z");
    expect(googleRule("FREQ=DAILY;UNTIL=20261130", true)).toBe("RRULE:FREQ=DAILY;UNTIL=20261130");
  });

  it("round-trips through fromGoogle", () => {
    const e = local({ description: "Bring drawings" });
    const back = fromGoogle({ id: "x", ...toGoogle(e) } as Parameters<typeof fromGoogle>[0], "UTC")!;
    expect(back).toMatchObject({ title: e.title, description: e.description, starts_at: e.starts_at, ends_at: e.ends_at, timezone: e.timezone });
    expect(sameFields({ ...e, starts_at: "2026-10-24T06:00:00+00:00" }, back)).toBe(true);
    expect(sameFields({ ...e, title: "Other" }, back)).toBe(false);
  });
});

describe("localWins", () => {
  const remote = { id: "a", updated: "2026-10-24T08:00:00.000Z" };
  it("keeps Google's copy when Life OS has nothing unsent", () => {
    expect(localWins({ needs_push: false, updated_at: "2026-10-24T09:00:00Z" }, remote)).toBe(false);
  });
  it("lets the newer edit win when both changed", () => {
    expect(localWins({ needs_push: true, updated_at: "2026-10-24T09:00:00Z" }, remote)).toBe(true);
    expect(localWins({ needs_push: true, updated_at: "2026-10-24T07:00:00Z" }, remote)).toBe(false);
  });
});
