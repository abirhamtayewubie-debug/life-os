/**
 * Calendar maths shared by the Calendar screen and the Command Center.
 *
 * Conventions
 * - Timed events store real instants (timestamptz) plus the zone they were
 *   created in. Recurrences repeat the local wall-clock time in that zone.
 * - All-day events are floating dates: starts_at / ends_at hold UTC midnight
 *   of the first and last day (both inclusive), so `starts_at.slice(0, 10)`
 *   is the date wherever the viewer is.
 */
import { addDays, diffDays, localDateKey, weekdayOf, zonedTimeToUtc } from "./dates";
import { iterate, parseRule } from "./recurrence";

export type CalendarEventRow = {
  id: string;
  title: string;
  kind: "event" | "meeting" | "appointment" | "time_block" | "reminder_only";
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  timezone?: string | null;
  recurrence_rule?: string | null;
};

export type Occurrence<E extends CalendarEventRow = CalendarEventRow> = E & {
  /** The stored event's id; `id` is unique per occurrence. */
  eventId: string;
  /** Local start date of this occurrence. */
  occurrenceDate: string;
  recurring: boolean;
  /** The stored event's own start / end (differs from the occurrence's for repeats). */
  series_starts_at: string;
  series_ends_at: string;
};

export type CalendarView = "day" | "week" | "month" | "agenda";

const wallTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export const allDayKey = (iso: string) => iso.slice(0, 10);
export const allDayIso = (dateKey: string) => `${dateKey}T00:00:00.000Z`;

/** First and last local day an occurrence touches. */
export function occurrenceSpan(e: CalendarEventRow, tz: string): [string, string] {
  if (e.all_day) return [allDayKey(e.starts_at), allDayKey(e.ends_at)];
  const s = localDateKey(new Date(e.starts_at), tz);
  // An event ending exactly at midnight doesn't touch the next day.
  const end = Math.max(new Date(e.starts_at).getTime(), new Date(e.ends_at).getTime() - 1);
  return [s, localDateKey(new Date(end), tz)];
}

/**
 * Expand events (recurring or not) into occurrences that touch
 * [fromKey, toKey] in the viewer's zone. Capped per event so a bad rule
 * can't produce unbounded work.
 */
export function expandEvents<E extends CalendarEventRow>(events: E[], fromKey: string, toKey: string, tz: string, perEventLimit = 400): Occurrence<E>[] {
  const out: Occurrence<E>[] = [];
  for (const e of events) {
    if (!e.recurrence_rule) {
      const [s, en] = occurrenceSpan(e, tz);
      if (s <= toKey && en >= fromKey) out.push({ ...e, eventId: e.id, occurrenceDate: s, recurring: false, series_starts_at: e.starts_at, series_ends_at: e.ends_at });
      continue;
    }
    let rule;
    try {
      rule = parseRule(e.recurrence_rule);
    } catch {
      // Unreadable rule: still show the first occurrence rather than hide it.
      const [s, en] = occurrenceSpan(e, tz);
      if (s <= toKey && en >= fromKey) out.push({ ...e, eventId: e.id, occurrenceDate: s, recurring: false, series_starts_at: e.starts_at, series_ends_at: e.ends_at });
      continue;
    }
    const ez = e.timezone || tz;
    if (e.all_day) {
      const start = allDayKey(e.starts_at);
      const span = Math.max(0, diffDays(start, allDayKey(e.ends_at)));
      let n = 0;
      for (const k of iterate(rule, start)) {
        if (k > toKey || n++ >= perEventLimit * 4) break;
        const last = addDays(k, span);
        if (last < fromKey) continue;
        out.push({ ...e, id: `${e.id}:${k}`, eventId: e.id, occurrenceDate: k, recurring: true, series_starts_at: e.starts_at, series_ends_at: e.ends_at, starts_at: allDayIso(k), ends_at: allDayIso(last) });
      }
      continue;
    }
    const startKey = localDateKey(new Date(e.starts_at), ez);
    const wall = wallTime(e.starts_at, ez);
    const dur = Math.max(0, new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime());
    let n = 0;
    for (const k of iterate(rule, startKey)) {
      if (n++ >= perEventLimit * 4) break;
      const s = zonedTimeToUtc(k, wall, ez);
      const occ = { ...e, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + dur).toISOString() };
      const [os, oe] = occurrenceSpan(occ, tz);
      if (os > toKey) break;
      if (oe < fromKey) continue;
      out.push({ ...occ, id: `${e.id}:${k}`, eventId: e.id, occurrenceDate: os, recurring: true, series_starts_at: e.starts_at, series_ends_at: e.ends_at });
    }
  }
  return out.sort(compareOccurrences);
}

export function compareOccurrences(a: CalendarEventRow, b: CalendarEventRow) {
  const ak = a.all_day ? allDayIso(allDayKey(a.starts_at)) : a.starts_at;
  const bk = b.all_day ? allDayIso(allDayKey(b.starts_at)) : b.starts_at;
  return Number(b.all_day) - Number(a.all_day) || ak.localeCompare(bk) || a.title.localeCompare(b.title);
}

/** Occurrences that touch a local day, all-day first. */
export function onDay<E extends CalendarEventRow>(occ: E[], dayKey: string, tz: string): E[] {
  return occ.filter((e) => {
    const [s, en] = occurrenceSpan(e, tz);
    return s <= dayKey && en >= dayKey;
  });
}

/** Ids of timed occurrences that overlap another one. */
export function conflictIds(occ: CalendarEventRow[]): Set<string> {
  const timed = occ.filter((e) => !e.all_day && e.kind !== "reminder_only").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = new Set<string>();
  let maxEnd = "";
  let maxId = "";
  for (const e of timed) {
    if (maxId && e.starts_at < maxEnd) {
      ids.add(e.id);
      ids.add(maxId);
    }
    if (e.ends_at > maxEnd) {
      maxEnd = e.ends_at;
      maxId = e.id;
    }
  }
  return ids;
}

/**
 * The visible date range for a view. Weeks start on Monday; month view pads
 * to whole weeks.
 */
export function rangeFor(view: CalendarView, dateKey: string): { from: string; to: string; days: string[] } {
  const monday = (k: string) => addDays(k, -((weekdayOf(k) + 6) % 7));
  let from: string;
  let to: string;
  if (view === "day") from = to = dateKey;
  else if (view === "week") {
    from = monday(dateKey);
    to = addDays(from, 6);
  } else if (view === "month") {
    const first = `${dateKey.slice(0, 7)}-01`;
    const [y, m] = first.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    from = monday(first);
    to = addDays(monday(last), 6);
  } else {
    from = dateKey;
    to = addDays(dateKey, 29);
  }
  const days: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) days.push(k);
  return { from, to, days };
}

/** Where `step` moves the anchor date for prev / next. */
export function shiftAnchor(view: CalendarView, dateKey: string, step: -1 | 1): string {
  if (view === "day") return addDays(dateKey, step);
  if (view === "week") return addDays(dateKey, 7 * step);
  if (view === "agenda") return addDays(dateKey, 30 * step);
  const [y, m] = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return d.toISOString().slice(0, 10);
}

/** Minutes since local midnight on `dayKey`, clamped to the day. */
export function minutesInDay(iso: string, dayKey: string, tz: string): number {
  const k = localDateKey(new Date(iso), tz);
  if (k < dayKey) return 0;
  if (k > dayKey) return 24 * 60;
  const [h, m] = wallTime(iso, tz).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Lay out a day's timed occurrences into side-by-side columns so overlaps
 * stay readable. Returns column index and column count per occurrence id.
 */
export function layoutDay(occ: CalendarEventRow[], dayKey: string, tz: string): Map<string, { col: number; cols: number; top: number; bottom: number }> {
  const items = occ
    .filter((e) => !e.all_day)
    .map((e) => {
      const top = minutesInDay(e.starts_at, dayKey, tz);
      const bottom = Math.max(top + 15, minutesInDay(e.ends_at, dayKey, tz));
      return { id: e.id, top, bottom };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const out = new Map<string, { col: number; cols: number; top: number; bottom: number }>();
  let cluster: { id: string; top: number; bottom: number; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) out.set(c.id, { col: c.col, cols, top: c.top, bottom: c.bottom });
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.top >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.bottom > it.top).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...it, col });
    clusterEnd = Math.max(clusterEnd, it.bottom);
  }
  if (cluster.length) flush();
  return out;
}

/** Wall time (HH:mm) of an instant in a zone. */
export { wallTime };

/**
 * Events kept in step one way with an outside calendar are read-only here. A
 * one-time file import ("ics") is a copy you own, and two-way Google Calendar
 * events ("google") send your edits back.
 */
export const isSyncedEvent = (provider: string | null | undefined) => !!provider && provider !== "ics" && provider !== "google";
