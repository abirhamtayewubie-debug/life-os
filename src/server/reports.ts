import "server-only";
import { addDays, diffDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { entryMinutes } from "@/features/work/stats";
import type { RawHabit } from "@/features/dashboard/types";
import { computeReport, reportBounds, shiftPeriod, type Measured, type ReportInput, type ReportPeriod, type TrackedArea } from "@/features/reports/compute";
import { getViewer } from "./viewer";

export type ReportView = {
  period: ReportPeriod;
  start: string;
  end: string;
  current: Measured;
  previous: Measured;
  projectNames: Record<string, string>;
  /** When this period's facts were last saved as a snapshot, if ever. */
  savedAt: string | null;
  interpretation: string | null;
  interpretationModel: string | null;
  interpretedAt: string | null;
  today: string;
  locale: string;
  demo: boolean;
};

const PERIODS = new Set<string>(["daily", "weekly", "monthly", "quarterly", "annual"]);

type Raw = {
  tasks: { completed_at: string | null; due_date: string | null }[];
  habits: (RawHabit & { paused_at: string | null })[];
  habitLogs: ReportInput["habitLogs"];
  time: { project_id: string | null; started_at: string; ended_at: string | null }[];
  workouts: ReportInput["workouts"];
  sleep: ReportInput["sleep"];
  wellness: ReportInput["wellness"];
  hydration: ReportInput["hydration"];
  money: ReportInput["money"];
  journalDates: string[];
  goals: { title: string; completed_at: string | null }[];
  milestones: { completed_at: string | null }[];
  learning: { title: string; finished_on: string | null; kind: string }[];
  interactions: string[];
  projectsDone: { name: string; completed_at: string | null }[];
  study: { studied_on: string; minutes: number; learning_item_id: string | null; page_from: number | null; page_to: number | null }[];
  bookIds: string[];
  steps: { done_at: string | null }[];
  meditation: { practiced_on: string; minutes: number }[];
  reviews: { review_date: string; kind: string }[];
  tracked: Partial<Record<TrackedArea, boolean>>;
};

/** Instants become the person's local dates here, once, so the maths never sees a UTC date. */
function toInput(raw: Raw, tz: string, now: Date): ReportInput {
  const local = (iso: string) => localDateKey(new Date(iso), tz);
  const books = new Set(raw.bookIds);
  return {
    tasksDone: raw.tasks.filter((t) => t.completed_at).map((t) => ({ completed_on: local(t.completed_at!), due_date: t.due_date })),
    habits: raw.habits.map((h) => ({ ...h, created_on: local(h.created_at), paused_on: h.paused_at ? local(h.paused_at) : null })),
    habitLogs: raw.habitLogs,
    focus: raw.time.map((e) => ({ date: local(e.started_at), project: e.project_id, minutes: entryMinutes(e, now) })),
    workouts: raw.workouts,
    sleep: raw.sleep,
    wellness: raw.wellness,
    hydration: raw.hydration,
    money: raw.money,
    journalDates: raw.journalDates,
    goalsAchieved: raw.goals.filter((g) => g.completed_at).map((g) => ({ completed_on: local(g.completed_at!), title: g.title })),
    milestonesDone: raw.milestones.filter((m) => m.completed_at).map((m) => local(m.completed_at!)),
    learningFinished: raw.learning.filter((l) => l.finished_on).map((l) => ({ finished_on: l.finished_on!, title: l.title, book: l.kind === "book" || l.kind === "article" })),
    interactions: raw.interactions,
    projectsCompleted: raw.projectsDone.filter((x) => x.completed_at).map((x) => ({ completed_on: local(x.completed_at!), name: x.name })),
    study: raw.study.map((x) => {
      const book = !!x.learning_item_id && books.has(x.learning_item_id);
      return { date: x.studied_on, minutes: x.minutes, book, pages: book && x.page_from !== null && x.page_to !== null ? x.page_to - x.page_from + 1 : 0 };
    }),
    stepsDone: raw.steps.filter((x) => x.done_at).map((x) => local(x.done_at!)),
    meditation: raw.meditation.map((x) => ({ date: x.practiced_on, minutes: x.minutes })),
    // Morning plans aren't reviews of a period, so they aren't counted.
    reviews: raw.reviews.filter((x) => x.kind !== "morning").map((x) => ({ date: x.review_date, kind: x.kind })),
    tracked: raw.tracked,
  };
}

export async function getReport(sp: Record<string, string | string[] | undefined>, now = new Date()): Promise<ReportView> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);
  const period = (typeof sp.period === "string" && PERIODS.has(sp.period) ? sp.period : "weekly") as ReportPeriod;
  const anchor = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) && sp.date <= today ? sp.date : today;

  let weekStart = 1;
  let raw: Raw;
  let projectNames: Record<string, string>;
  let saved: { generated_at: string; interpretation: string | null; interpretation_model: string | null; interpreted_at: string | null } | null = null;

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    raw = {
      tasks: s.tasks, habits: s.habits as Raw["habits"], habitLogs: s.habit_logs, time: s.time_entries,
      workouts: s.workouts, sleep: s.sleep_logs, wellness: s.wellness_logs, hydration: s.hydration_logs,
      money: s.transactions.map((t) => ({ ...t, is_pending: false })),
      journalDates: s.journal_entries.map((j) => j.entry_date),
      goals: s.goals.map((g) => ({ title: g.title, completed_at: null })), milestones: s.milestones,
      learning: s.learning_items, interactions: s.interactions.map((i) => i.occurred_on),
      // Demo projects have no completion dates, so none show as finished.
      projectsDone: [],
      study: s.demo_study_sessions, bookIds: s.demo_learning_items.filter((i) => i.kind === "book").map((i) => i.id),
      steps: s.learning_steps, meditation: s.meditation_sessions, reviews: s.demo_reviews,
      tracked: { workouts: true, sleep: true, checkins: true, water: true, money: true, journal: true, people: true, projects: true, study: true, meditation: true, reading: true, reviews: true },
    };
    projectNames = Object.fromEntries(s.projects.map((p) => [p.id, p.name]));
    return build();
  }

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase.from("profiles").select("week_starts_on").eq("id", viewer.userId).maybeSingle();
  weekStart = prof?.week_starts_on ?? 1;
  const { start, end } = reportBounds(period, anchor, weekStart);
  const from = reportBounds(period, shiftPeriod(period, start, -1), weekStart).start;
  // Instants are fetched with a day of margin either side; local dates are applied after.
  const fromTs = `${addDays(from, -1)}T00:00:00Z`;
  const toTs = `${addDays(end, 2)}T00:00:00Z`;
  const any = (table: "workouts" | "sleep_logs" | "wellness_logs" | "hydration_logs" | "transactions" | "journal_entries" | "interactions" | "projects" | "study_sessions" | "meditation_sessions" | "daily_reviews") =>
    supabase.from(table).select("id").limit(1);
  const [tasks, habits, habitLogs, time, workouts, sleep, wellness, hydration, money, journal, goals, milestones, learning, interactions, projects, report,
    projectsDone, study, books, steps, meditation, reviews, ...ever] = await Promise.all([
    supabase.from("tasks").select("completed_at, due_date").eq("status", "done").gte("completed_at", fromTs).lt("completed_at", toTs).limit(20000),
    supabase.from("habits").select("id, name, cadence, schedule_days, target_per_period, time_of_day, paused_at, created_at, source").is("archived_at", null),
    supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", from).lte("log_date", end).limit(50000),
    supabase.from("time_entries").select("project_id, started_at, ended_at").gte("started_at", fromTs).lt("started_at", toTs).limit(20000),
    supabase.from("workouts").select("performed_on, activity, duration_minutes, perceived_effort").gte("performed_on", from).lte("performed_on", end).limit(10000),
    supabase.from("sleep_logs").select("sleep_date, bedtime, wake_time, duration_minutes, quality").gte("sleep_date", from).lte("sleep_date", end).limit(5000),
    supabase.from("wellness_logs").select("log_date, mood, energy, stress").gte("log_date", from).lte("log_date", end).limit(20000),
    supabase.from("hydration_logs").select("log_date, amount_ml").gte("log_date", from).lte("log_date", end).limit(50000),
    supabase.from("transactions").select("occurred_on, kind, amount::text, currency, is_pending").in("kind", ["income", "expense"]).gte("occurred_on", from).lte("occurred_on", end).limit(50000),
    // Journal: dates only. Entry text is never read for reports.
    supabase.from("journal_entries").select("entry_date").is("archived_at", null).gte("entry_date", from).lte("entry_date", end).limit(10000),
    supabase.from("goals").select("title, completed_at").eq("status", "completed").gte("completed_at", fromTs).lt("completed_at", toTs),
    supabase.from("milestones").select("completed_at").gte("completed_at", fromTs).lt("completed_at", toTs),
    supabase.from("learning_items").select("title, finished_on, kind").eq("status", "completed").gte("finished_on", from).lte("finished_on", end),
    supabase.from("interactions").select("occurred_on").gte("occurred_on", from).lte("occurred_on", end).limit(10000),
    supabase.from("projects").select("id, name"),
    supabase.from("reports").select("generated_at, interpretation, interpretation_model, interpreted_at").eq("period", period).eq("period_start", start).maybeSingle(),
    supabase.from("projects").select("name, completed_at").gte("completed_at", fromTs).lt("completed_at", toTs),
    supabase.from("study_sessions").select("studied_on, minutes, learning_item_id, page_from, page_to").gte("studied_on", from).lte("studied_on", end).limit(20000),
    supabase.from("learning_items").select("id").in("kind", ["book", "article"]).limit(5000),
    supabase.from("learning_steps").select("done_at").gte("done_at", fromTs).lt("done_at", toTs).limit(5000),
    supabase.from("meditation_sessions").select("practiced_on, minutes").gte("practiced_on", from).lte("practiced_on", end).limit(10000),
    supabase.from("daily_reviews").select("review_date, kind").gte("review_date", from).lte("review_date", end).limit(5000),
    // Whether each area has ever had an entry: one id each, nothing else.
    ...(["workouts", "sleep_logs", "wellness_logs", "hydration_logs", "transactions", "journal_entries", "interactions", "projects", "study_sessions", "meditation_sessions", "daily_reviews"] as const).map(any),
  ]);
  for (const r of [tasks, habits, habitLogs, time, workouts, sleep, wellness, hydration, money, journal, goals, milestones, learning, interactions, projects, report, projectsDone, study, books, steps, meditation, reviews, ...ever]) {
    if (r.error) throw new Error(`Could not load the report: ${r.error.message}`);
  }
  raw = {
    tasks: tasks.data ?? [], habits: (habits.data ?? []) as Raw["habits"], habitLogs: habitLogs.data ?? [], time: time.data ?? [],
    workouts: workouts.data ?? [], sleep: sleep.data ?? [], wellness: wellness.data ?? [], hydration: hydration.data ?? [],
    money: money.data ?? [], journalDates: (journal.data ?? []).map((j) => j.entry_date),
    goals: goals.data ?? [], milestones: milestones.data ?? [], learning: learning.data ?? [], interactions: (interactions.data ?? []).map((i) => i.occurred_on),
    projectsDone: projectsDone.data ?? [], study: study.data ?? [], bookIds: (books.data ?? []).map((b) => b.id), steps: steps.data ?? [],
    meditation: meditation.data ?? [], reviews: reviews.data ?? [],
    tracked: Object.fromEntries((["workouts", "sleep", "checkins", "water", "money", "journal", "people", "projects", "study", "meditation", "reviews"] as const).map((k, i) => [k, (ever[i].data?.length ?? 0) > 0])),
  };
  raw.tracked.reading = raw.bookIds.length > 0;
  projectNames = Object.fromEntries((projects.data ?? []).map((p) => [p.id, p.name]));
  saved = report.data ?? null;
  return build();

  function build(): ReportView {
    const { start, end } = reportBounds(period, anchor, weekStart);
    const prevStart = shiftPeriod(period, start, -1);
    const prev = reportBounds(period, prevStart, weekStart);
    const input = toInput(raw, timezone, now);
    return {
      period, start, end,
      current: computeReport(input, period, start, end, today, timezone),
      // The previous period is compared over the same number of days, so a week in progress isn't set against a full one.
      previous: computeReport(input, period, prev.start, prev.end, addDays(prev.start, diffDays(start, today < end ? today : end)), timezone),
      projectNames, savedAt: saved?.generated_at ?? null, interpretation: saved?.interpretation ?? null, interpretationModel: saved?.interpretation_model ?? null, interpretedAt: saved?.interpreted_at ?? null, today, locale, demo: viewer.mode === "demo",
    };
  }
}
