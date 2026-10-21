import { addDays, diffDays, weekdayOf } from "@/lib/dates";
import { fromMinor, toMinor, type Money } from "@/lib/money";
import { isScheduled } from "@/features/dashboard/compute";
import type { RawHabit } from "@/features/dashboard/types";
import { sleepSummary, workoutSummary, type Night, type WorkoutLite } from "@/features/health/metrics";
import { shiftMonth } from "@/features/finance/ledger";

/**
 * Reports are counts and averages of what was logged in a period, compared
 * with the period before. They contain no interpretation: anything written
 * about them (by the assistant, later) is stored and shown separately.
 */

export type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
export const PERIODS: { v: ReportPeriod; label: string }[] = [
  { v: "daily", label: "Day" }, { v: "weekly", label: "Week" }, { v: "monthly", label: "Month" }, { v: "quarterly", label: "Quarter" }, { v: "annual", label: "Year" },
];

export function reportBounds(period: ReportPeriod, anchor: string, weekStart = 1): { start: string; end: string } {
  const [y, m] = anchor.split("-").map(Number);
  switch (period) {
    case "daily": return { start: anchor, end: anchor };
    case "weekly": { const start = addDays(anchor, -((weekdayOf(anchor) - weekStart + 7) % 7)); return { start, end: addDays(start, 6) }; }
    case "monthly": { const start = `${anchor.slice(0, 7)}-01`; return { start, end: addDays(`${shiftMonth(anchor.slice(0, 7), 1)}-01`, -1) }; }
    case "quarterly": { const q = Math.floor((m - 1) / 3); const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`; return { start, end: addDays(`${shiftMonth(start.slice(0, 7), 3)}-01`, -1) }; }
    case "annual": return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
}

/** The anchor date for the period `delta` steps before or after the one starting at `start`. */
export function shiftPeriod(period: ReportPeriod, start: string, delta: number): string {
  switch (period) {
    case "daily": return addDays(start, delta);
    case "weekly": return addDays(start, 7 * delta);
    case "monthly": return `${shiftMonth(start.slice(0, 7), delta)}-01`;
    case "quarterly": return `${shiftMonth(start.slice(0, 7), 3 * delta)}-01`;
    case "annual": return `${Number(start.slice(0, 4)) + delta}-01-01`;
  }
}

export function periodLabel(period: ReportPeriod, start: string, end: string, locale: string): string {
  const d = (k: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(new Date(`${k}T00:00:00Z`));
  switch (period) {
    case "daily": return d(start, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    case "weekly": return `${d(start, { month: "short", day: "numeric" })} – ${d(end, { month: "short", day: "numeric", year: "numeric" })}`;
    case "monthly": return d(start, { month: "long", year: "numeric" });
    case "quarterly": return `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`;
    case "annual": return start.slice(0, 4);
  }
}

/* ------------------------------------------------------------------------ */

export type ReportInput = {
  /** Local completion date, due date. */
  tasksDone: { completed_on: string; due_date: string | null }[];
  habits: (RawHabit & { created_on: string; paused_on: string | null })[];
  habitLogs: { habit_id: string; log_date: string; count: number }[];
  /** Minutes per local day and project (null = no project). */
  focus: { date: string; project: string | null; minutes: number }[];
  workouts: WorkoutLite[];
  sleep: Night[];
  wellness: { log_date: string; mood: number | null; energy: number | null; stress: number | null }[];
  hydration: { log_date: string; amount_ml: number }[];
  money: { occurred_on: string; kind: string; amount: string; currency: string; is_pending: boolean }[];
  journalDates: string[];
  goalsAchieved: { completed_on: string; title: string }[];
  milestonesDone: string[];
  learningFinished: { finished_on: string; title: string }[];
  interactions: string[];
};

export type Measured = {
  period: ReportPeriod;
  start: string;
  /** Last day included: the period end, or today for a period still running. */
  through: string;
  days: number;
  tasks: { completed: number; onTime: number; late: number; noDueDate: number };
  habits: { checkins: number; scheduled: number; kept: number; rate: number | null };
  focus: { minutes: number; byProject: { project: string | null; minutes: number }[] };
  health: {
    workouts: number; workoutMinutes: number; activeDays: number;
    nights: number; sleepAvgMinutes: number | null; restedAvg: number | null;
    checkinDays: number; mood: number | null; energy: number | null; stress: number | null;
    waterDays: number; waterAvgMl: number | null;
  };
  money: { currency: string; income: Money; expenses: Money; net: Money }[];
  life: { journalDays: number; goalsAchieved: string[]; milestones: number; learningFinished: string[]; interactions: number };
  /** Days in the period with at least one entry of any kind, to show how complete the picture is. */
  daysWithData: number;
};

const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function computeReport(data: ReportInput, period: ReportPeriod, start: string, end: string, today: string, timeZone: string): Measured {
  const through = end < today ? end : today;
  const r = (d: string) => inRange(d, start, through);
  const seen = new Set<string>();
  const mark = (d: string) => { if (r(d)) seen.add(d); };

  const tasks = data.tasksDone.filter((t) => r(t.completed_on));
  tasks.forEach((t) => mark(t.completed_on));

  // Habits: a scheduled day of a daily habit counts once the habit existed and wasn't paused.
  const logs = data.habitLogs.filter((l) => r(l.log_date));
  logs.forEach((l) => mark(l.log_date));
  let scheduled = 0;
  let kept = 0;
  for (const h of data.habits) {
    if (h.cadence !== "daily") continue;
    const byDate = new Map<string, number>();
    for (const l of logs) if (l.habit_id === h.id) byDate.set(l.log_date, (byDate.get(l.log_date) ?? 0) + l.count);
    for (let d = start; d <= through; d = addDays(d, 1)) {
      if (d < h.created_on || (h.paused_on && d >= h.paused_on) || !isScheduled(h, d)) continue;
      scheduled++;
      if ((byDate.get(d) ?? 0) >= h.target_per_period) kept++;
    }
  }

  const focus = data.focus.filter((f) => r(f.date));
  focus.forEach((f) => mark(f.date));
  const byProject = new Map<string | null, number>();
  for (const f of focus) byProject.set(f.project, (byProject.get(f.project) ?? 0) + f.minutes);

  const wk = workoutSummary(data.workouts, start, through);
  data.workouts.forEach((w) => mark(w.performed_on));
  const nights = data.sleep.filter((n) => r(n.sleep_date));
  nights.forEach((n) => mark(n.sleep_date));
  const sl = sleepSummary(nights, timeZone);
  const well = data.wellness.filter((w) => r(w.log_date));
  well.forEach((w) => mark(w.log_date));
  const water = data.hydration.filter((h) => r(h.log_date));
  water.forEach((h) => mark(h.log_date));
  const waterByDay = new Map<string, number>();
  for (const h of water) waterByDay.set(h.log_date, (waterByDay.get(h.log_date) ?? 0) + h.amount_ml);

  const money = new Map<string, { income: bigint; expenses: bigint }>();
  for (const t of data.money) {
    if (!r(t.occurred_on) || t.is_pending || (t.kind !== "income" && t.kind !== "expense")) continue;
    mark(t.occurred_on);
    const m = money.get(t.currency) ?? { income: 0n, expenses: 0n };
    const v = toMinor(t.amount, t.currency);
    if (t.kind === "income") m.income += v; else m.expenses += -v;
    money.set(t.currency, m);
  }

  const journal = new Set(data.journalDates.filter(r));
  journal.forEach(mark);
  const interactions = data.interactions.filter(r);
  interactions.forEach(mark);

  return {
    period, start, through, days: diffDays(start, through) + 1,
    tasks: {
      completed: tasks.length,
      onTime: tasks.filter((t) => t.due_date && t.completed_on <= t.due_date).length,
      late: tasks.filter((t) => t.due_date && t.completed_on > t.due_date).length,
      noDueDate: tasks.filter((t) => !t.due_date).length,
    },
    habits: { checkins: logs.reduce((a, l) => a + l.count, 0), scheduled, kept, rate: scheduled ? Math.round((kept / scheduled) * 100) : null },
    focus: { minutes: Math.round(focus.reduce((a, f) => a + f.minutes, 0)), byProject: [...byProject.entries()].map(([project, minutes]) => ({ project, minutes: Math.round(minutes) })).sort((a, b) => b.minutes - a.minutes).slice(0, 5) },
    health: {
      workouts: wk.sessions, workoutMinutes: wk.minutes, activeDays: wk.activeDays,
      nights: sl.nights, sleepAvgMinutes: sl.avgMinutes, restedAvg: sl.avgQuality,
      checkinDays: new Set(well.map((w) => w.log_date)).size,
      mood: avg1(well.map((w) => w.mood).filter((x): x is number => x !== null)),
      energy: avg1(well.map((w) => w.energy).filter((x): x is number => x !== null)),
      stress: avg1(well.map((w) => w.stress).filter((x): x is number => x !== null)),
      waterDays: waterByDay.size,
      waterAvgMl: waterByDay.size ? Math.round([...waterByDay.values()].reduce((a, b) => a + b, 0) / waterByDay.size) : null,
    },
    money: [...money.entries()].map(([currency, m]) => ({
      currency,
      income: { amount: fromMinor(m.income, currency), currency },
      expenses: { amount: fromMinor(m.expenses, currency), currency },
      net: { amount: fromMinor(m.income - m.expenses, currency), currency },
    })).sort((a, b) => a.currency.localeCompare(b.currency)),
    life: {
      journalDays: journal.size,
      goalsAchieved: data.goalsAchieved.filter((g) => r(g.completed_on)).map((g) => g.title),
      milestones: data.milestonesDone.filter(r).length,
      learningFinished: data.learningFinished.filter((l) => r(l.finished_on)).map((l) => l.title),
      interactions: interactions.length,
    },
    daysWithData: seen.size,
  };
}

/** A plain difference for "vs last period"; null when either side has nothing to compare. */
export function delta(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null;
  return Math.round((now - before) * 10) / 10;
}
