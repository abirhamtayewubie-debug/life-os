import { addDays, isValidTimeZone, localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { isValidRule, parseRule, serializeRule } from "@/lib/recurrence";

/**
 * iCalendar (RFC 5545) reading and writing for calendar files and feeds.
 * Only what calendars actually exchange for personal events: title, notes,
 * place, times (timed, all-day, with or without a time zone) and the repeat
 * rules this app supports. Anything else is skipped and reported, never guessed.
 *
 * All-day events in this app are stored as UTC midnight of the first and last
 * day (both inclusive); iCalendar uses an exclusive end date.
 */

export type IcsEventOut = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrenceRule?: string | null;
  updatedAt?: string | null;
};

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Folds a content line at 75 octets, never splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; size = 0; }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const utcStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateOnly = (key: string) => key.replace(/-/g, "");

function localStamp(iso: string, tz: string) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(d).replace(/:/g, "");
  return `${dateOnly(localDateKey(d, tz))}T${parts}`;
}

export function toIcs(events: IcsEventOut[], opts: { name: string; now?: Date }): string {
  const stamp = utcStamp((opts.now ?? new Date()).toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Life OS//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(opts.name)}`];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@life-os`, `DTSTAMP:${e.updatedAt ? utcStamp(e.updatedAt) : stamp}`);
    if (e.allDay) {
      const first = e.startsAt.slice(0, 10);
      const last = e.endsAt.slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(first)}`, `DTEND;VALUE=DATE:${dateOnly(addDays(last, 1))}`);
    } else if (e.recurrenceRule && isValidTimeZone(e.timezone) && e.timezone !== "UTC") {
      // Repeats keep their wall-clock time across daylight-saving changes.
      lines.push(`DTSTART;TZID=${e.timezone}:${localStamp(e.startsAt, e.timezone)}`, `DTEND;TZID=${e.timezone}:${localStamp(e.endsAt, e.timezone)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(e.startsAt)}`, `DTEND:${utcStamp(e.endsAt)}`);
    }
    if (e.recurrenceRule && isValidRule(e.recurrenceRule)) {
      const r = parseRule(e.recurrenceRule);
      const rule = serializeRule(r).replace(/UNTIL=(\d{8})/, (_, d) => (e.allDay ? `UNTIL=${d}` : `UNTIL=${d}T235959Z`));
      lines.push(`RRULE:${rule}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                  */
/* ------------------------------------------------------------------------ */

export type IcsEventIn = {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: string; // ISO instant (all-day: UTC midnight of the first day)
  endsAt: string; // ISO instant (all-day: UTC midnight of the last day, inclusive)
  timezone: string;
  recurrenceRule: string | null;
};

export type IcsParseResult = { events: IcsEventIn[]; skipped: { reason: string; count: number }[]; calendarName: string | null };

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter((l) => l.length > 0);
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=VALUE;PARAM="quoted:value":VALUE
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ":" && !inQuote) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...rawParams] = head.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

const unescapeText = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

/** Common Windows zone names that Outlook writes in TZID. */
const WINDOWS_ZONES: Record<string, string> = {
  "E. Africa Standard Time": "Africa/Addis_Ababa",
  "Eastern Standard Time": "America/Toronto",
  "Pacific Standard Time": "America/Los_Angeles",
  "Central Standard Time": "America/Chicago",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Arabian Standard Time": "Asia/Dubai",
  "UTC": "UTC",
};

type When = { allDay: true; date: string } | { allDay: false; instant: Date; tz: string | null };

function parseWhen(p: Prop, fallbackTz: string): When | null {
  const v = p.value.trim();
  if (p.params.VALUE === "DATE" || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` } : null;
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = `${m[4]}:${m[5]}`;
  if (m[7] === "Z") return { allDay: false, instant: new Date(`${date}T${time}:${m[6]}Z`), tz: null };
  const tzid = p.params.TZID ? (WINDOWS_ZONES[p.params.TZID] ?? p.params.TZID.replace(/^\/[^/]+\//, "")) : null;
  const tz = tzid && isValidTimeZone(tzid) ? tzid : fallbackTz;
  const instant = zonedTimeToUtc(date, time, tz);
  instant.setUTCSeconds(Number(m[6]));
  return { allDay: false, instant, tz };
}

function parseDuration(s: string): number | null {
  const m = s.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, w, d, h, min, sec] = m;
  const ms = (((Number(w ?? 0) * 7 + Number(d ?? 0)) * 24 + Number(h ?? 0)) * 60 + Number(min ?? 0)) * 60_000 + Number(sec ?? 0) * 1000;
  return sign === "-" ? -ms : ms;
}

export const MAX_IMPORT_EVENTS = 2000;

export function parseIcs(text: string, fallbackTz: string): IcsParseResult {
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const events: IcsEventIn[] = [];
  let calendarName: string | null = null;
  let cur: Prop[] | null = null;
  let depth = 0; // nested components inside a VEVENT (VALARM) are ignored

  for (const line of unfold(text)) {
    const p = parseLine(line);
    if (!p) continue;
    if (p.name === "BEGIN") {
      if (p.value.toUpperCase() === "VEVENT" && !cur) cur = [];
      else if (cur) depth++;
      continue;
    }
    if (p.name === "END") {
      if (cur && depth > 0) { depth--; continue; }
      if (cur && p.value.toUpperCase() === "VEVENT") {
        const ev = toEvent(cur, fallbackTz, skip);
        if (ev) events.push(ev);
        cur = null;
      }
      continue;
    }
    if (cur && depth === 0) cur.push(p);
    else if (!cur && p.name === "X-WR-CALNAME") calendarName = unescapeText(p.value).slice(0, 120);
  }

  // The same UID twice (a file exported with changes): keep the last one.
  const byUid = new Map<string, IcsEventIn>();
  for (const e of events) byUid.set(e.uid, e);
  let unique = [...byUid.values()];
  if (unique.length > MAX_IMPORT_EVENTS) {
    for (let i = MAX_IMPORT_EVENTS; i < unique.length; i++) skip(`More than ${MAX_IMPORT_EVENTS} events in one file`);
    unique = unique.slice(0, MAX_IMPORT_EVENTS);
  }
  return { events: unique, calendarName, skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })) };
}

function toEvent(props: Prop[], fallbackTz: string, skip: (r: string) => void): IcsEventIn | null {
  const get = (n: string) => props.find((p) => p.name === n);
  if (get("RECURRENCE-ID")) { skip("Changes to single occurrences of a repeating event"); return null; }
  if (get("STATUS")?.value.toUpperCase() === "CANCELLED") { skip("Cancelled events"); return null; }
  const startProp = get("DTSTART");
  const start = startProp && parseWhen(startProp, fallbackTz);
  if (!start) { skip("Events without a readable start time"); return null; }

  const title = unescapeText(get("SUMMARY")?.value ?? "").slice(0, 300) || "(No title)";
  const uid = (get("UID")?.value.trim() || `${title}|${startProp!.value}`).slice(0, 300);
  const description = get("DESCRIPTION") ? unescapeText(get("DESCRIPTION")!.value).slice(0, 10000) || null : null;
  const location = get("LOCATION") ? unescapeText(get("LOCATION")!.value).slice(0, 300) || null : null;

  let recurrenceRule: string | null = null;
  const rrule = get("RRULE")?.value;
  if (rrule) {
    // Our rules carry UNTIL as a date; iCalendar often has a time on it.
    const simplified = rrule.replace(/(UNTIL=\d{8})T\d{6}Z?/i, "$1").replace(/;?WKST=[A-Z]{2}/i, "");
    if (isValidRule(simplified)) recurrenceRule = serializeRule(parseRule(simplified));
    else skip("Repeat rules this app doesn't support (imported as one-off)");
  }
  if (get("RDATE") || get("EXDATE")) skip("Extra or excluded dates on repeating events (ignored)");

  const endProp = get("DTEND");
  const duration = get("DURATION") ? parseDuration(get("DURATION")!.value) : null;

  if (start.allDay) {
    let lastDay = start.date;
    const end = endProp && parseWhen(endProp, fallbackTz);
    if (end && end.allDay && end.date > start.date) lastDay = addDays(end.date, -1);
    else if (duration && duration > 0) lastDay = addDays(start.date, Math.max(0, Math.ceil(duration / 86_400_000) - 1));
    return { uid, title, description, location, allDay: true, startsAt: `${start.date}T00:00:00.000Z`, endsAt: `${lastDay}T00:00:00.000Z`, timezone: fallbackTz, recurrenceRule };
  }

  let endsAt: Date;
  const end = endProp && parseWhen(endProp, fallbackTz);
  if (end && !end.allDay) endsAt = end.instant;
  else if (duration !== null) endsAt = new Date(start.instant.getTime() + duration);
  else endsAt = new Date(start.instant.getTime()); // RFC 5545: no end means it ends when it starts
  if (endsAt < start.instant) { skip("Events that end before they start"); return null; }
  if (endsAt.getTime() === start.instant.getTime()) endsAt = new Date(start.instant.getTime() + 30 * 60_000);
  return { uid, title, description, location, allDay: false, startsAt: start.instant.toISOString(), endsAt: endsAt.toISOString(), timezone: start.tz ?? fallbackTz, recurrenceRule };
}
