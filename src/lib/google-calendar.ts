import { addDays } from "./dates";
import { allDayIso, allDayKey } from "./calendar";

/**
 * Translating between Life OS calendar events and Google Calendar events.
 * Pure functions only; the network side lives in src/server/google.
 */

export const GOOGLE_PROVIDER = "google";
export const GOOGLE_INTEGRATION = "google_calendar";

/** The parts of a Google Calendar event that Life OS reads. */
export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  updated?: string;
  recurringEventId?: string;
  eventType?: string;
};

/** The Life OS columns a Google event fills in. */
export type SyncedFields = {
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  timezone: string;
};

/** A Life OS event as the sync reads it. */
export type LocalEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  recurrence_rule: string | null;
};

// Google's event ids use base32hex (0-9, a-v), so a uuid without dashes is a
// valid id. Creating events under that id makes a retried create harmless.
export const googleIdFor = (lifeOsId: string) => lifeOsId.replace(/-/g, "").toLowerCase();

/** The Life OS id a Google event was created from, if its id has that shape. */
export function lifeOsIdFrom(googleId: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(googleId)) return null;
  const h = googleId;
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Event types that aren't really events (Google's office/home location markers). */
export const skipType = (e: GoogleEvent) => e.eventType === "workingLocation";

/** Google event → Life OS columns, or null when it has no usable time. */
export function fromGoogle(e: GoogleEvent, fallbackTz: string): SyncedFields | null {
  const base = {
    title: (e.summary?.trim() || "(No title)").slice(0, 300),
    description: e.description ? e.description.slice(0, 10000) : null,
    location: e.location ? e.location.trim().slice(0, 300) || null : null,
  };
  const tz = (e.start?.timeZone || fallbackTz || "UTC").slice(0, 64);
  if (e.start?.date) {
    const start = e.start.date;
    // Google's all-day end date is the day after; Life OS stores the last day.
    const last = e.end?.date ? addDays(e.end.date, -1) : start;
    return { ...base, all_day: true, starts_at: allDayIso(start), ends_at: allDayIso(last < start ? start : last), timezone: tz };
  }
  if (e.start?.dateTime) {
    const s = new Date(e.start.dateTime);
    const end = new Date(e.end?.dateTime ?? e.start.dateTime);
    if (Number.isNaN(s.getTime()) || Number.isNaN(end.getTime())) return null;
    return { ...base, all_day: false, starts_at: s.toISOString(), ends_at: (end < s ? s : end).toISOString(), timezone: tz };
  }
  return null;
}

/** Life OS event → the body Google's insert and patch take. */
export function toGoogle(e: LocalEvent) {
  const tz = e.timezone || "UTC";
  const timed = (iso: string) => ({ dateTime: new Date(iso).toISOString(), timeZone: tz });
  const body: Record<string, unknown> = {
    summary: e.title,
    description: e.description ?? "",
    location: e.location ?? "",
    start: e.all_day ? { date: allDayKey(e.starts_at) } : timed(e.starts_at),
    end: e.all_day ? { date: addDays(allDayKey(e.ends_at), 1) } : timed(e.ends_at),
  };
  if (e.recurrence_rule) body.recurrence = [googleRule(e.recurrence_rule, e.all_day)];
  return body;
}

/** Life OS stores RRULE parts; Google wants the "RRULE:" line, with a timed UNTIL for timed events. */
export function googleRule(rule: string, allDay: boolean): string {
  const r = allDay ? rule : rule.replace(/UNTIL=(\d{8})(?!T)/, "UNTIL=$1T235959Z");
  return `RRULE:${r}`;
}

/** True when the Life OS copy should win over the Google copy. */
export function localWins(local: { needs_push: boolean; updated_at: string }, remote: GoogleEvent): boolean {
  if (!local.needs_push) return false;
  if (!remote.updated) return true;
  return new Date(local.updated_at).getTime() > new Date(remote.updated).getTime();
}

/** True when a Life OS event already shows what Google has. */
export function sameFields(local: LocalEvent, f: SyncedFields): boolean {
  const t = (iso: string) => new Date(iso).getTime();
  return local.title === f.title && (local.description ?? null) === f.description && (local.location ?? null) === f.location
    && local.all_day === f.all_day && t(local.starts_at) === t(f.starts_at) && t(local.ends_at) === t(f.ends_at)
    && (f.all_day || local.timezone === f.timezone);
}
