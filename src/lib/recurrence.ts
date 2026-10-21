/**
 * A deliberately small, fully tested subset of RFC 5545 RRULE.
 *
 * Recurrence is evaluated on LOCAL calendar dates (YYYY-MM-DD) in the
 * record's time zone; a timed occurrence is then placed with
 * zonedTimeToUtc(date, wallTime, tz). That keeps "every Monday at 09:00"
 * at 09:00 across daylight-saving changes.
 *
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, BYDAY (weekly),
 * BYMONTHDAY (monthly), COUNT, UNTIL (date). Anything else is rejected
 * rather than silently misread.
 */
import { addDays, weekdayOf } from "./dates";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Rule = {
  freq: Freq;
  interval: number;
  byDay?: number[]; // 0 = Sunday … 6 = Saturday
  byMonthDay?: number; // 1–31
  count?: number;
  until?: string; // YYYY-MM-DD, inclusive
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class RecurrenceError extends Error {}

export function parseRule(input: string): Rule {
  const s = input.trim().replace(/^RRULE:/i, "");
  if (!s) throw new RecurrenceError("Empty rule");
  const parts = new Map<string, string>();
  for (const kv of s.split(";")) {
    const [k, v] = kv.split("=");
    if (!k || v === undefined) throw new RecurrenceError(`Malformed part: ${kv}`);
    parts.set(k.toUpperCase(), v.toUpperCase());
  }
  const allowed = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "COUNT", "UNTIL"]);
  for (const k of parts.keys()) if (!allowed.has(k)) throw new RecurrenceError(`Unsupported rule part: ${k}`);

  const freq = parts.get("FREQ") as Freq | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) throw new RecurrenceError("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY");

  const interval = parts.has("INTERVAL") ? Number(parts.get("INTERVAL")) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 366) throw new RecurrenceError("INTERVAL must be 1–366");

  const rule: Rule = { freq, interval };

  if (parts.has("BYDAY")) {
    if (freq !== "WEEKLY") throw new RecurrenceError("BYDAY is only supported with FREQ=WEEKLY");
    const days = parts.get("BYDAY")!.split(",").map((d) => DAY_CODES.indexOf(d));
    if (!days.length || days.some((d) => d < 0)) throw new RecurrenceError("BYDAY must list days like MO,WE,FR");
    rule.byDay = [...new Set(days)].sort((a, b) => a - b);
  }
  if (parts.has("BYMONTHDAY")) {
    if (freq !== "MONTHLY") throw new RecurrenceError("BYMONTHDAY is only supported with FREQ=MONTHLY");
    const d = Number(parts.get("BYMONTHDAY"));
    if (!Number.isInteger(d) || d < 1 || d > 31) throw new RecurrenceError("BYMONTHDAY must be 1–31");
    rule.byMonthDay = d;
  }
  if (parts.has("COUNT") && parts.has("UNTIL")) throw new RecurrenceError("Use COUNT or UNTIL, not both");
  if (parts.has("COUNT")) {
    const c = Number(parts.get("COUNT"));
    if (!Number.isInteger(c) || c < 1 || c > 1000) throw new RecurrenceError("COUNT must be 1–1000");
    rule.count = c;
  }
  if (parts.has("UNTIL")) {
    const m = parts.get("UNTIL")!.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) throw new RecurrenceError("UNTIL must be a date like 20261231");
    rule.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return rule;
}

export function serializeRule(r: Rule): string {
  const out = [`FREQ=${r.freq}`];
  if (r.interval !== 1) out.push(`INTERVAL=${r.interval}`);
  if (r.byDay?.length) out.push(`BYDAY=${r.byDay.map((d) => DAY_CODES[d]).join(",")}`);
  if (r.byMonthDay) out.push(`BYMONTHDAY=${r.byMonthDay}`);
  if (r.count) out.push(`COUNT=${r.count}`);
  if (r.until) out.push(`UNTIL=${r.until.replace(/-/g, "")}`);
  return out.join(";");
}

export function isValidRule(s: string): boolean {
  try {
    parseRule(s);
    return true;
  } catch {
    return false;
  }
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const ymd = (k: string) => k.split("-").map(Number) as [number, number, number];
const key = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Yields occurrence dates in order, starting at `start` (the series' first
 * date, which always counts as an occurrence when it matches the rule).
 */
export function* iterate(rule: Rule, start: string): Generator<string> {
  let emitted = 0;
  const done = (k: string) => (rule.until !== undefined && k > rule.until) || (rule.count !== undefined && emitted >= rule.count);
  const [sy, sm, sd] = ymd(start);

  if (rule.freq === "DAILY") {
    for (let k = start; ; k = addDays(k, rule.interval)) {
      if (done(k)) return;
      emitted++;
      yield k;
    }
  }

  if (rule.freq === "WEEKLY") {
    const days = rule.byDay?.length ? rule.byDay : [weekdayOf(start)];
    // Weeks are anchored on the Sunday on/before the start date.
    const weekStart = addDays(start, -weekdayOf(start));
    for (let w = 0; ; w += rule.interval) {
      for (const d of days) {
        const k = addDays(weekStart, w * 7 + d);
        if (k < start) continue;
        if (done(k)) return;
        emitted++;
        yield k;
      }
      if (w > 52 * 200) return;
    }
  }

  if (rule.freq === "MONTHLY") {
    const day = rule.byMonthDay ?? sd;
    for (let i = 0; i < 12 * 200; i += rule.interval) {
      const y = sy + Math.floor((sm - 1 + i) / 12);
      const m = ((sm - 1 + i) % 12) + 1;
      if (day > daysInMonth(y, m)) continue; // RFC 5545: invalid dates are skipped
      const k = key(y, m, day);
      if (k < start) continue;
      if (done(k)) return;
      emitted++;
      yield k;
    }
    return;
  }

  if (rule.freq === "YEARLY") {
    for (let i = 0; i < 200; i += rule.interval) {
      const y = sy + i;
      if (sd > daysInMonth(y, sm)) continue; // Feb 29 only in leap years
      const k = key(y, sm, sd);
      if (done(k)) return;
      emitted++;
      yield k;
    }
  }
}

/** Occurrence dates within [from, to] inclusive, capped at `limit`. */
export function occurrencesBetween(rule: Rule, start: string, from: string, to: string, limit = 500): string[] {
  const out: string[] = [];
  for (const k of iterate(rule, start)) {
    if (k > to || out.length >= limit) break;
    if (k >= from) out.push(k);
  }
  return out;
}

/** First occurrence strictly after `after`, or null when the series has ended. */
export function nextOccurrence(rule: Rule, start: string, after: string): string | null {
  for (const k of iterate(rule, start)) if (k > after) return k;
  return null;
}

export function describeRule(r: Rule): string {
  const n = r.interval;
  let base: string;
  switch (r.freq) {
    case "DAILY":
      base = n === 1 ? "Every day" : `Every ${n} days`;
      break;
    case "WEEKLY": {
      const days = r.byDay ?? [];
      const isWeekdays = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
      if (n === 1 && isWeekdays) base = "Every weekday";
      else base = `${n === 1 ? "Every week" : `Every ${n} weeks`}${days.length ? ` on ${days.map((d) => DAY_NAMES[d]).join(", ")}` : ""}`;
      break;
    }
    case "MONTHLY":
      base = `${n === 1 ? "Every month" : `Every ${n} months`}${r.byMonthDay ? ` on day ${r.byMonthDay}` : ""}`;
      break;
    case "YEARLY":
      base = n === 1 ? "Every year" : `Every ${n} years`;
  }
  if (r.count) base += `, ${r.count} times`;
  if (r.until) base += `, until ${r.until}`;
  return base;
}

/** Presets for forms. `start` decides the weekday / day-of-month used. */
export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";

export function ruleFromPreset(preset: RepeatPreset, start: string): string | null {
  switch (preset) {
    case "none": return null;
    case "daily": return "FREQ=DAILY";
    case "weekdays": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly": return `FREQ=WEEKLY;BYDAY=${DAY_CODES[weekdayOf(start)]}`;
    case "biweekly": return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${DAY_CODES[weekdayOf(start)]}`;
    case "monthly": return `FREQ=MONTHLY;BYMONTHDAY=${Number(start.slice(8, 10))}`;
    case "yearly": return "FREQ=YEARLY";
  }
}

export function presetFromRule(rule: string | null | undefined): RepeatPreset | "custom" {
  if (!rule) return "none";
  try {
    const r = parseRule(rule);
    if (r.count || r.until) return "custom";
    if (r.freq === "DAILY" && r.interval === 1) return "daily";
    if (r.freq === "WEEKLY" && r.interval === 1 && r.byDay?.length === 5 && !r.byDay.includes(0) && !r.byDay.includes(6)) return "weekdays";
    if (r.freq === "WEEKLY" && r.byDay?.length === 1 && r.interval === 1) return "weekly";
    if (r.freq === "WEEKLY" && r.byDay?.length === 1 && r.interval === 2) return "biweekly";
    if (r.freq === "MONTHLY" && r.interval === 1) return "monthly";
    if (r.freq === "YEARLY" && r.interval === 1) return "yearly";
    return "custom";
  } catch {
    return "custom";
  }
}

