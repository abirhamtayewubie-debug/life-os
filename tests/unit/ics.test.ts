import { describe, expect, it } from "vitest";
import { MAX_IMPORT_EVENTS, parseIcs, toIcs, type IcsEventOut } from "@/lib/ics";

const AA = "Africa/Addis_Ababa";
const NY = "America/New_York";
const cal = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", "X-WR-CALNAME:Work", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

describe("writing .ics", () => {
  const base: IcsEventOut = { id: "e1", title: "Standup; daily, quick", allDay: false, startsAt: "2026-10-21T06:00:00.000Z", endsAt: "2026-10-21T06:15:00.000Z", timezone: AA };

  it("writes timed events in UTC with escaped text and CRLF line endings", () => {
    const out = toIcs([{ ...base, description: "Line one\nLine two", location: "Room 4" }], { name: "Life OS", now: new Date("2026-10-22T00:00:00Z") });
    expect(out).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(out).toContain("UID:e1@life-os");
    expect(out).toContain("DTSTART:20261021T060000Z");
    expect(out).toContain("DTEND:20261021T061500Z");
    expect(out).toContain(String.raw`SUMMARY:Standup\; daily\, quick`);
    expect(out).toContain("DESCRIPTION:Line one\\nLine two");
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("writes all-day events with an exclusive end date", () => {
    const out = toIcs([{ ...base, allDay: true, startsAt: "2026-10-21T00:00:00.000Z", endsAt: "2026-10-23T00:00:00.000Z" }], { name: "x" });
    expect(out).toContain("DTSTART;VALUE=DATE:20261021");
    expect(out).toContain("DTEND;VALUE=DATE:20261024");
  });

  it("keeps repeating events on local time and gives UNTIL a time", () => {
    const out = toIcs([{ ...base, timezone: NY, startsAt: "2026-10-21T13:00:00.000Z", endsAt: "2026-10-21T13:30:00.000Z", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231" }], { name: "x" });
    expect(out).toContain("DTSTART;TZID=America/New_York:20261021T090000");
    expect(out).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z");
  });

  it("folds long lines without splitting characters, and reads them back", () => {
    const title = "Ethiopian coffee ceremony ☕ ".repeat(8).trim();
    const out = toIcs([{ ...base, title }], { name: "x" });
    expect(out).toMatch(/\r\n /);
    expect(parseIcs(out, AA).events[0].title).toBe(title);
  });
});

describe("reading .ics", () => {
  it("round-trips what it writes", () => {
    const events: IcsEventOut[] = [
      { id: "a", title: "Timed", allDay: false, startsAt: "2026-10-21T06:00:00.000Z", endsAt: "2026-10-21T07:00:00.000Z", timezone: AA, location: "Bole", description: "a, b; c\\d" },
      { id: "b", title: "Holiday", allDay: true, startsAt: "2026-10-24T00:00:00.000Z", endsAt: "2026-10-25T00:00:00.000Z", timezone: AA },
      { id: "c", title: "Gym", allDay: false, startsAt: "2026-10-21T15:00:00.000Z", endsAt: "2026-10-21T16:00:00.000Z", timezone: AA, recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH" },
    ];
    const { events: back, skipped, calendarName } = parseIcs(toIcs(events, { name: "Mine" }), NY);
    expect(calendarName).toBe("Mine");
    expect(skipped).toEqual([]);
    expect(back.map((e) => [e.uid, e.title, e.allDay, e.startsAt, e.endsAt, e.recurrenceRule])).toEqual([
      ["a@life-os", "Timed", false, "2026-10-21T06:00:00.000Z", "2026-10-21T07:00:00.000Z", null],
      ["b@life-os", "Holiday", true, "2026-10-24T00:00:00.000Z", "2026-10-25T00:00:00.000Z", null],
      ["c@life-os", "Gym", false, "2026-10-21T15:00:00.000Z", "2026-10-21T16:00:00.000Z", "FREQ=WEEKLY;BYDAY=TU,TH"],
    ]);
    expect(back[0].description).toBe("a, b; c\\d");
    expect(back[2].timezone).toBe(AA);
  });

  it("understands TZID, Windows zone names, DURATION and missing ends", () => {
    const { events } = parseIcs(cal(
      vevent("UID:1", "SUMMARY:NY", "DTSTART;TZID=America/New_York:20260115T090000", "DTEND;TZID=America/New_York:20260115T100000"),
      vevent("UID:2", "SUMMARY:Outlook", 'DTSTART;TZID="E. Africa Standard Time":20260115T090000', "DURATION:PT45M"),
      vevent("UID:3", "SUMMARY:Floating", "DTSTART:20260115T090000"),
      vevent("UID:4", "SUMMARY:Unknown zone", "DTSTART;TZID=Mars/Olympus:20260115T090000", "DTEND;TZID=Mars/Olympus:20260115T093000"),
    ), AA);
    expect(events.map((e) => [e.uid, e.startsAt, e.endsAt, e.timezone])).toEqual([
      ["1", "2026-01-15T14:00:00.000Z", "2026-01-15T15:00:00.000Z", NY],
      ["2", "2026-01-15T06:00:00.000Z", "2026-01-15T06:45:00.000Z", AA],
      ["3", "2026-01-15T06:00:00.000Z", "2026-01-15T06:30:00.000Z", AA],
      ["4", "2026-01-15T06:00:00.000Z", "2026-01-15T06:30:00.000Z", AA],
    ]);
  });

  it("reads one-day and multi-day all-day events", () => {
    const { events } = parseIcs(cal(
      vevent("UID:d1", "SUMMARY:One", "DTSTART;VALUE=DATE:20261101"),
      vevent("UID:d2", "SUMMARY:Three", "DTSTART;VALUE=DATE:20261101", "DTEND;VALUE=DATE:20261104"),
    ), AA);
    expect(events.map((e) => [e.allDay, e.startsAt.slice(0, 10), e.endsAt.slice(0, 10)])).toEqual([[true, "2026-11-01", "2026-11-01"], [true, "2026-11-01", "2026-11-03"]]);
  });

  it("skips what it can't represent and says so, never guessing", () => {
    const { events, skipped } = parseIcs(cal(
      vevent("UID:r", "SUMMARY:Monthly 2nd Tue", "DTSTART:20260113T080000Z", "DTEND:20260113T090000Z", "RRULE:FREQ=MONTHLY;BYDAY=2TU"),
      vevent("UID:o", "RECURRENCE-ID:20260120T080000Z", "SUMMARY:Moved", "DTSTART:20260121T080000Z"),
      vevent("UID:c", "STATUS:CANCELLED", "SUMMARY:Gone", "DTSTART:20260121T080000Z"),
      vevent("UID:n", "SUMMARY:No start"),
      vevent("UID:b", "SUMMARY:Backwards", "DTSTART:20260121T090000Z", "DTEND:20260121T080000Z"),
      vevent("UID:u", "SUMMARY:Until with time", "DTSTART:20260105T080000Z", "DTEND:20260105T083000Z", "RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20260330T080000Z", "EXDATE:20260112T080000Z"),
    ), AA);
    expect(events.map((e) => [e.uid, e.recurrenceRule])).toEqual([["r", null], ["u", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260330"]]);
    expect(skipped).toEqual(expect.arrayContaining([
      { reason: "Repeat rules this app doesn't support (imported as one-off)", count: 1 },
      { reason: "Changes to single occurrences of a repeating event", count: 1 },
      { reason: "Cancelled events", count: 1 },
      { reason: "Events without a readable start time", count: 1 },
      { reason: "Events that end before they start", count: 1 },
      { reason: "Extra or excluded dates on repeating events (ignored)", count: 1 },
    ]));
  });

  it("ignores alarms inside events, keeps the last copy of a UID and caps the count", () => {
    const withAlarm = vevent("UID:x", "SUMMARY:First", "DTSTART:20260101T080000Z", "BEGIN:VALARM", "TRIGGER:-PT10M", "DESCRIPTION:Alarm text", "END:VALARM");
    const again = vevent("UID:x", "SUMMARY:Second", "DTSTART:20260101T080000Z");
    const r = parseIcs(cal(withAlarm, again), AA);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({ title: "Second", description: null });
    const many = Array.from({ length: MAX_IMPORT_EVENTS + 3 }, (_, i) => vevent(`UID:m${i}`, "SUMMARY:m", "DTSTART:20260101T080000Z"));
    const capped = parseIcs(cal(...many), AA);
    expect(capped.events).toHaveLength(MAX_IMPORT_EVENTS);
    expect(capped.skipped).toEqual([{ reason: `More than ${MAX_IMPORT_EVENTS} events in one file`, count: 3 }]);
  });

  it("accepts LF-only files and a byte-order mark", () => {
    const text = "﻿" + cal(vevent("UID:lf", "SUMMARY:Unix", "DTSTART:20260101T080000Z")).replace(/\r\n/g, "\n");
    expect(parseIcs(text, AA).events[0].title).toBe("Unix");
  });
});
