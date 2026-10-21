import { addDays, diffDays } from "@/lib/dates";
import type { ImportantDate, Person } from "./types";

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The next time a date comes round, on or after today. A 29 February date
 * is marked on 28 February in non-leap years. One-off dates only count if
 * they haven't passed.
 */
export function nextOccurrence(dateKey: string, todayKey: string, recursYearly = true): string | null {
  if (!recursYearly) return dateKey >= todayKey ? dateKey : null;
  const [, m, d] = dateKey.split("-").map(Number);
  const on = (y: number) => `${y}-${pad(m)}-${pad(m === 2 && d === 29 && !isLeap(y) ? 28 : d)}`;
  const year = Number(todayKey.slice(0, 4));
  const thisYear = on(year);
  return thisYear >= todayKey ? thisYear : on(year + 1);
}

/** Whole years from the original date to an occurrence (the age turned, or the anniversary number). */
export function yearsAt(dateKey: string, occurrence: string): number {
  return Number(occurrence.slice(0, 4)) - Number(dateKey.slice(0, 4));
}

export type Upcoming = { key: string; title: string; kind: ImportantDate["kind"]; on: string; inDays: number; years: number | null; remind: number; personId: string | null; dateId: string | null };

/** Birthdays from people (flagged a week ahead) plus important dates (flagged by their own setting), soonest first, within `window` days. */
export function upcomingDates(people: Person[], dates: ImportantDate[], todayKey: string, window = 60): Upcoming[] {
  const out: Upcoming[] = [];
  for (const p of people) {
    if (!p.birthday) continue;
    const on = nextOccurrence(p.birthday, todayKey)!;
    out.push({ key: `b:${p.id}`, title: `${p.name}'s birthday`, kind: "birthday", on, inDays: diffDays(todayKey, on), years: yearsAt(p.birthday, on), remind: 7, personId: p.id, dateId: null });
  }
  for (const d of dates) {
    const on = nextOccurrence(d.date, todayKey, d.recurs_yearly);
    if (!on) continue;
    out.push({ key: `d:${d.id}`, title: d.title, kind: d.kind, on, inDays: diffDays(todayKey, on), years: d.recurs_yearly && d.kind !== "renewal" ? yearsAt(d.date, on) : null, remind: d.remind_days_before, personId: d.person_id, dateId: d.id });
  }
  return out.filter((u) => u.inDays <= window).sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
}

export type ContactState = { due: string | null; overdueDays: number; status: "none" | "never" | "due" | "ok" };

/** Keep-in-touch status: only for people with a cadence set. */
export function contactState(p: Pick<Person, "contact_every_days" | "last_contacted_on">, todayKey: string): ContactState {
  if (!p.contact_every_days) return { due: null, overdueDays: 0, status: "none" };
  if (!p.last_contacted_on) return { due: todayKey, overdueDays: 0, status: "never" };
  const due = addDays(p.last_contacted_on, p.contact_every_days);
  const overdue = diffDays(due, todayKey);
  return { due, overdueDays: Math.max(0, overdue), status: overdue >= 0 ? "due" : "ok" };
}
