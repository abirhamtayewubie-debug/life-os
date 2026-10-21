/**
 * Time-zone aware helpers. All instants are stored as UTC; "local date" means
 * the calendar date in the user's IANA time zone.
 */

/** YYYY-MM-DD for an instant in a time zone. */
export function localDateKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hour (0–23) of an instant in a time zone. */
export function localHour(instant: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(instant);
  return Number(h) % 24;
}

export function greetingFor(instant: Date, timeZone: string): string {
  const h = localHour(instant, timeZone);
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Add whole days to a YYYY-MM-DD key (calendar arithmetic, DST-proof). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole-day difference b − a between two YYYY-MM-DD keys. */
export function diffDays(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD key. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The UTC instant at which a given local wall-clock time occurs in a zone.
 * Resolves the offset iteratively so DST transitions are handled.
 */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(new Date(guess), timeZone);
    const next = wallAsUtc - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function formatTime(instant: Date | string, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
}

export function formatLongDate(instant: Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(instant);
}

export function formatShortDate(dateKey: string, locale = "en-US"): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "today", "tomorrow", "in 3 days", "2 days ago" relative to a local today. */
export function relativeDay(dateKey: string, todayKey: string): string {
  const n = diffDays(todayKey, dateKey);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
