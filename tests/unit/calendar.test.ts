import { describe, expect, it } from "vitest";
import { conflictIds, expandEvents, layoutDay, onDay, rangeFor, shiftAnchor, type CalendarEventRow } from "@/lib/calendar";
import { zonedTimeToUtc } from "@/lib/dates";

const NY = "America/New_York";
const AA = "Africa/Addis_Ababa";
const ev = (id: string, starts: Date, ends: Date, extra: Partial<CalendarEventRow> = {}): CalendarEventRow => ({
  id, title: id, kind: "event", starts_at: starts.toISOString(), ends_at: ends.toISOString(), all_day: false, location: null, ...extra,
});

describe("calendar ranges", () => {
  it("week starts Monday and month pads to whole weeks", () => {
    expect(rangeFor("week", "2026-10-21")).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
    const m = rangeFor("month", "2026-10-21");
    expect(m.from).toBe("2026-09-28");
    expect(m.to).toBe("2026-11-01");
    expect(m.days.length % 7).toBe(0);
    expect(rangeFor("agenda", "2026-10-21").days).toHaveLength(30);
  });

  it("moves the anchor by the view's unit, clamping months", () => {
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("week", "2026-10-21", -1)).toBe("2026-10-14");
    expect(shiftAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("expanding repeating events", () => {
  it("keeps local wall time across a DST change", () => {
    const e = ev("standup", zonedTimeToUtc("2026-10-26", "09:00", NY), zonedTimeToUtc("2026-10-26", "09:15", NY), { timezone: NY, recurrence_rule: "FREQ=WEEKLY;BYDAY=MO" });
    const occ = expandEvents([e], "2026-10-26", "2026-11-09", NY);
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    // EDT (UTC−4) before 1 Nov, EST (UTC−5) after.
    expect(occ[0].starts_at).toBe("2026-10-26T13:00:00.000Z");
    expect(occ[1].starts_at).toBe("2026-11-02T14:00:00.000Z");
    expect(occ[1].ends_at).toBe("2026-11-02T14:15:00.000Z");
    expect(new Set(occ.map((o) => o.id)).size).toBe(3);
    expect(occ.every((o) => o.eventId === "standup" && o.series_starts_at === e.starts_at)).toBe(true);
  });

  it("includes an earlier occurrence that runs into the range", () => {
    const e = ev("night", zonedTimeToUtc("2026-10-01", "22:00", AA), zonedTimeToUtc("2026-10-02", "02:00", AA), { timezone: AA, recurrence_rule: "FREQ=DAILY" });
    const occ = expandEvents([e], "2026-10-10", "2026-10-10", AA);
    expect(occ.map((o) => o.occurrenceDate)).toEqual(["2026-10-09", "2026-10-10"]);
  });

  it("repeats all-day events as floating dates and honours COUNT", () => {
    const e: CalendarEventRow = { id: "bday", title: "Birthday", kind: "event", all_day: true, starts_at: "2026-03-05T00:00:00.000Z", ends_at: "2026-03-05T00:00:00.000Z", location: null, recurrence_rule: "FREQ=YEARLY;COUNT=2" };
    expect(expandEvents([e], "2026-01-01", "2030-12-31", NY).map((o) => o.occurrenceDate)).toEqual(["2026-03-05", "2027-03-05"]);
  });

  it("still shows a single event with an unreadable rule", () => {
    const e = ev("x", new Date("2026-10-21T10:00:00Z"), new Date("2026-10-21T11:00:00Z"), { recurrence_rule: "FREQ=HOURLY" });
    expect(expandEvents([e], "2026-10-21", "2026-10-21", "UTC")).toHaveLength(1);
  });
});

describe("conflicts and layout", () => {
  const a = ev("a", new Date("2026-10-21T09:00:00Z"), new Date("2026-10-21T10:00:00Z"));
  const b = ev("b", new Date("2026-10-21T09:30:00Z"), new Date("2026-10-21T10:30:00Z"));
  const c = ev("c", new Date("2026-10-21T10:30:00Z"), new Date("2026-10-21T11:00:00Z"));
  const d = ev("d", new Date("2026-10-21T08:00:00Z"), new Date("2026-10-21T12:00:00Z"));

  it("flags overlaps, not back-to-back events", () => {
    expect([...conflictIds([a, b, c])].sort()).toEqual(["a", "b"]);
    expect([...conflictIds([a, c])]).toEqual([]);
    // A long event overlapping everything inside it.
    expect([...conflictIds([d, a, c])].sort()).toEqual(["a", "c", "d"]);
  });

  it("puts overlapping events side by side", () => {
    const l = layoutDay([a, b, c], "2026-10-21", "UTC");
    expect(l.get("a")).toMatchObject({ col: 0, cols: 2, top: 540 });
    expect(l.get("b")).toMatchObject({ col: 1, cols: 2 });
    expect(l.get("c")).toMatchObject({ col: 0, cols: 1 });
  });

  it("an event ending at midnight belongs to one day only", () => {
    const late = ev("late", new Date("2026-10-21T22:00:00Z"), new Date("2026-10-22T00:00:00Z"));
    expect(onDay([late], "2026-10-21", "UTC")).toHaveLength(1);
    expect(onDay([late], "2026-10-22", "UTC")).toHaveLength(0);
  });
});
