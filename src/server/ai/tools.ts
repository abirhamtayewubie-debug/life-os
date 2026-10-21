import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, diffDays, formatTime, localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { expandEvents, type CalendarEventRow } from "@/lib/calendar";
import { fromMinor, toMinor } from "@/lib/money";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { permittedScopes, type AiScope, type AiSettings } from "@/features/assistant/models";
import { PERIODS } from "@/features/reports/compute";
import { getReport } from "../reports";

/**
 * The assistant's tools. Read tools run with the person's own RLS-scoped
 * client and return capped, plain JSON. Proposal tools never write: the
 * runner stores them as pending and the person confirms in the app.
 */

export type ToolContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  timezone: string;
  locale: string;
  today: string;
  now: Date;
  settings: AiSettings;
};

export type ReadResult = { data: unknown; count: number; summary: string };

type ToolBase<S extends z.ZodType> = { name: string; scope: AiScope; description: string; input: S };
export type ReadTool<S extends z.ZodType = z.ZodType> = ToolBase<S> & { kind: "read"; run: (ctx: ToolContext, input: z.output<S>) => Promise<ReadResult> };
export type ProposalTool<S extends z.ZodType = z.ZodType> = ToolBase<S> & {
  kind: "propose";
  /** Checks the proposal against the person's records (ids exist, etc.) and says in plain words what will happen. */
  prepare: (ctx: ToolContext, input: z.output<S>) => Promise<{ ok: true; summary: string } | { ok: false; error: string }>;
};
export type AnyTool = ReadTool | ProposalTool;

const read = <S extends z.ZodType>(t: Omit<ReadTool<S>, "kind">) => ({ ...t, kind: "read" }) as unknown as ReadTool;
const propose = <S extends z.ZodType>(t: Omit<ProposalTool<S>, "kind">) => ({ ...t, kind: "propose" }) as unknown as ProposalTool;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("A date as YYYY-MM-DD in the person's time zone");
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("A local time as HH:MM (24-hour)");
const uuid = z.uuid();
const clip = (s: string | null | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? null);

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`Couldn't read ${what}.`);
  return (r.data ?? []) as T;
}

/* ------------------------------------------------------------------------ */
/* Read tools                                                               */
/* ------------------------------------------------------------------------ */

const listTasks = read({
  name: "list_tasks", scope: "tasks",
  description: "List the person's tasks. Open tasks include to-do, in-progress and waiting. Filter by due date range or a word in the title. Overdue means a due date before today.",
  input: z.object({
    status: z.enum(["open", "done", "all"]).default("open"),
    due_from: dateKey.optional(),
    due_to: dateKey.optional(),
    query: z.string().trim().min(1).max(100).optional().describe("Words that appear in the title"),
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async run(ctx, i) {
    let q = ctx.supabase.from("tasks").select("id, title, status, priority, area, due_date, due_at, completed_at, project_id, is_top_priority").is("archived_at", null).is("parent_task_id", null);
    if (i.status === "open") q = q.in("status", ["todo", "in_progress", "waiting"]);
    if (i.status === "done") q = q.eq("status", "done");
    if (i.due_from) q = q.gte("due_date", i.due_from);
    if (i.due_to) q = q.lte("due_date", i.due_to);
    if (i.query) q = q.ilike("title", `%${i.query.replace(/[%_]/g, "")}%`);
    const rows = must(await q.order("due_date", { ascending: true, nullsFirst: false }).order("priority").limit(i.limit), "tasks") as {
      id: string; title: string; status: string; priority: number; area: string; due_date: string | null; due_at: string | null; completed_at: string | null; project_id: string | null; is_top_priority: boolean;
    }[];
    const data = rows.map((t) => {
      const due = t.due_at ? localDateKey(new Date(t.due_at), ctx.timezone) : t.due_date;
      return {
        id: t.id, title: t.title, status: t.status, priority: ["urgent", "high", "normal", "low"][t.priority - 1], area: t.area,
        due: due ? `${due}${t.due_at ? ` ${formatTime(t.due_at, ctx.timezone, "en-GB")}` : ""}` : null,
        overdue: !!due && due < ctx.today && t.status !== "done",
        top_priority: t.is_top_priority || undefined,
        completed_on: t.completed_at ? localDateKey(new Date(t.completed_at), ctx.timezone) : undefined,
        link: `/tasks?open=${t.id}`,
      };
    });
    return { data, count: data.length, summary: `Read ${data.length} task${data.length === 1 ? "" : "s"}` };
  },
});

const listEvents = read({
  name: "list_events", scope: "calendar",
  description: "List calendar events (including each occurrence of repeating ones) between two dates, inclusive. At most 62 days.",
  input: z.object({ from: dateKey, to: dateKey }),
  async run(ctx, raw) {
    const i = raw as { from: string; to: string };
    if (i.to < i.from || diffDays(i.from, i.to) > 62) throw new Error("Use a range of at most 62 days, with 'to' on or after 'from'.");
    const startIso = zonedTimeToUtc(addDays(i.from, -1), "00:00", ctx.timezone).toISOString();
    const endIso = zonedTimeToUtc(addDays(i.to, 2), "00:00", ctx.timezone).toISOString();
    const cols = "id, title, kind, starts_at, ends_at, all_day, location, timezone, recurrence_rule";
    const [single, recurring] = await Promise.all([
      ctx.supabase.from("calendar_events").select(cols).is("archived_at", null).is("recurrence_rule", null).lt("starts_at", endIso).gt("ends_at", startIso).limit(500),
      ctx.supabase.from("calendar_events").select(cols).is("archived_at", null).not("recurrence_rule", "is", null).lt("starts_at", endIso).limit(200),
    ]);
    const events = [...must(single, "events"), ...must(recurring, "events")] as CalendarEventRow[];
    const occ = expandEvents(events, i.from, i.to, ctx.timezone).slice(0, 100);
    const data = occ.map((o) => ({
      title: o.title, kind: o.kind, date: o.occurrenceDate,
      time: o.all_day ? "all day" : `${formatTime(o.starts_at, ctx.timezone, "en-GB")}–${formatTime(o.ends_at, ctx.timezone, "en-GB")}`,
      location: o.location ?? undefined, repeats: o.recurring || undefined,
      link: `/calendar?view=day&date=${o.occurrenceDate}`,
    }));
    return { data, count: data.length, summary: `Read ${data.length} event${data.length === 1 ? "" : "s"}` };
  },
});

const listHabits = read({
  name: "list_habits", scope: "habits",
  description: "List active habits with their schedule and which of the last 14 days were checked in.",
  input: z.object({}),
  async run(ctx) {
    const from = addDays(ctx.today, -13);
    const [habits, logs] = await Promise.all([
      ctx.supabase.from("habits").select("id, name, cadence, schedule_days, target_per_period, time_of_day, paused_at").is("archived_at", null).limit(100),
      ctx.supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", from).lte("log_date", ctx.today).limit(3000),
    ]);
    const L = must(logs, "habit check-ins") as { habit_id: string; log_date: string; count: number }[];
    const data = (must(habits, "habits") as { id: string; name: string; cadence: string; schedule_days: number[] | null; target_per_period: number; time_of_day: string | null; paused_at: string | null }[]).map((h) => ({
      id: h.id, name: h.name, cadence: h.cadence, target: h.target_per_period, time_of_day: h.time_of_day ?? undefined, paused: !!h.paused_at || undefined,
      scheduled_weekdays: h.schedule_days ?? undefined,
      checked_in_on: L.filter((l) => l.habit_id === h.id && l.count > 0).map((l) => l.log_date).sort(),
      link: "/habits",
    }));
    return { data: { today: ctx.today, habits: data }, count: data.length, summary: `Read ${data.length} habit${data.length === 1 ? "" : "s"}` };
  },
});

const listGoals = read({
  name: "list_goals", scope: "goals",
  description: "List goals (vision to quarterly) with status, target date, progress metric and open milestones.",
  input: z.object({ include_finished: z.boolean().default(false) }),
  async run(ctx, i) {
    let q = ctx.supabase.from("goals").select("id, title, level, status, target_date, metric_label, metric_target::text, metric_current::text, parent_goal_id").is("archived_at", null);
    if (!i.include_finished) q = q.in("status", ["active", "paused"]);
    const [goals, ms] = await Promise.all([
      q.limit(100),
      ctx.supabase.from("milestones").select("goal_id, title, due_date, completed_at").not("goal_id", "is", null).is("completed_at", null).limit(300),
    ]);
    const M = must(ms, "milestones") as { goal_id: string; title: string; due_date: string | null }[];
    const data = (must(goals, "goals") as { id: string; title: string; level: string; status: string; target_date: string | null; metric_label: string | null; metric_target: string | null; metric_current: string | null; parent_goal_id: string | null }[]).map((g) => ({
      id: g.id, title: g.title, level: g.level, status: g.status, target_date: g.target_date ?? undefined,
      progress: g.metric_label ? `${g.metric_current ?? 0} of ${g.metric_target ?? "?"} ${g.metric_label}` : undefined,
      parent_goal_id: g.parent_goal_id ?? undefined,
      open_milestones: M.filter((m) => m.goal_id === g.id).map((m) => ({ title: m.title, due: m.due_date ?? undefined })),
      link: `/goals?open=${g.id}`,
    }));
    return { data, count: data.length, summary: `Read ${data.length} goal${data.length === 1 ? "" : "s"}` };
  },
});

const listProjects = read({
  name: "list_projects", scope: "work",
  description: "List work projects with status, dates and how many open tasks each has.",
  input: z.object({}),
  async run(ctx) {
    const [projects, tasks] = await Promise.all([
      ctx.supabase.from("projects").select("id, name, status, area, start_date, due_date").is("archived_at", null).limit(100),
      ctx.supabase.from("tasks").select("project_id").not("project_id", "is", null).in("status", ["todo", "in_progress", "waiting"]).is("archived_at", null).limit(5000),
    ]);
    const T = must(tasks, "tasks") as { project_id: string }[];
    const data = (must(projects, "projects") as { id: string; name: string; status: string; area: string; start_date: string | null; due_date: string | null }[]).map((p) => ({
      id: p.id, name: p.name, status: p.status, area: p.area, start: p.start_date ?? undefined, due: p.due_date ?? undefined,
      open_tasks: T.filter((t) => t.project_id === p.id).length, link: `/work?project=${p.id}`,
    }));
    return { data, count: data.length, summary: `Read ${data.length} project${data.length === 1 ? "" : "s"}` };
  },
});

const listLearning = read({
  name: "list_learning", scope: "learning",
  description: "List books, courses and other learning items with status and progress.",
  input: z.object({}),
  async run(ctx) {
    const rows = must(await ctx.supabase.from("learning_items").select("title, kind, author, status, progress_pct, started_on, finished_on").limit(100), "learning items") as Record<string, unknown>[];
    return { data: rows.map((r) => ({ ...r, link: "/learning" })), count: rows.length, summary: `Read ${rows.length} learning item${rows.length === 1 ? "" : "s"}` };
  },
});

const listPeople = read({
  name: "list_people", scope: "relationships",
  description: "List people with relationship, birthday, when they were last contacted, how often the person wants to be in touch, and upcoming important dates. Private notes are never included.",
  input: z.object({}),
  async run(ctx) {
    const [people, dates] = await Promise.all([
      ctx.supabase.from("people").select("id, name, relationship, birthday, contact_every_days, last_contacted_on").is("archived_at", null).limit(200),
      ctx.supabase.from("important_dates").select("person_id, title, date, recurs_yearly").limit(500),
    ]);
    const D = must(dates, "important dates") as { person_id: string | null; title: string; date: string; recurs_yearly: boolean }[];
    const data = (must(people, "people") as { id: string; name: string; relationship: string | null; birthday: string | null; contact_every_days: number | null; last_contacted_on: string | null }[]).map((p) => ({
      name: p.name, relationship: p.relationship ?? undefined, birthday: p.birthday ?? undefined,
      contact_every_days: p.contact_every_days ?? undefined, last_contacted_on: p.last_contacted_on ?? undefined,
      overdue_for_contact: p.contact_every_days && p.last_contacted_on ? diffDays(p.last_contacted_on, ctx.today) > p.contact_every_days : undefined,
      important_dates: D.filter((d) => d.person_id === p.id).map((d) => ({ title: d.title, date: d.date, yearly: d.recurs_yearly })),
      link: "/relationships",
    }));
    return { data, count: data.length, summary: `Read ${data.length} ${data.length === 1 ? "person" : "people"}` };
  },
});

const listAdmin = read({
  name: "list_admin_items", scope: "admin",
  description: "List home and admin items: renewals, documents, chores and records, with due dates. Reference numbers are not included.",
  input: z.object({}),
  async run(ctx) {
    const rows = must(await ctx.supabase.from("admin_items").select("kind, title, category, due_on, repeat_months, completed_at").is("archived_at", null).limit(200), "admin items") as { due_on: string | null }[];
    const data = rows.map((r) => ({ ...r, overdue: r.due_on ? r.due_on < ctx.today : undefined, link: "/admin" }));
    return { data, count: data.length, summary: `Read ${data.length} admin item${data.length === 1 ? "" : "s"}` };
  },
});

const searchNotes = read({
  name: "search_notes", scope: "knowledge",
  description: "Search the knowledge base notes by words. Returns titles and the start of each note.",
  input: z.object({ query: z.string().trim().min(2).max(100) }),
  async run(ctx, i) {
    const rows = must(await ctx.supabase.from("notes").select("id, title, kind, body, updated_at").is("archived_at", null).textSearch("search", i.query, { type: "websearch", config: "simple" }).limit(10), "notes") as { id: string; title: string; kind: string; body: string; updated_at: string }[];
    const data = rows.map((n) => ({ title: n.title, kind: n.kind, excerpt: clip(n.body, 600), updated_on: localDateKey(new Date(n.updated_at), ctx.timezone), link: `/knowledge?note=${n.id}` }));
    return { data, count: data.length, summary: `Found ${data.length} note${data.length === 1 ? "" : "s"}` };
  },
});

const getReportTool = read({
  name: "get_report", scope: "reports",
  description: "Counts for a day, week, month, quarter or year (tasks, habits, focus time, and health or money if shared), compared with the period before over the same number of days.",
  input: z.object({ period: z.enum(PERIODS.map((p) => p.v) as ["daily", "weekly", "monthly", "quarterly", "annual"]).default("weekly"), date: dateKey.optional().describe("Any date inside the period; defaults to today") }),
  async run(ctx, raw) {
    const i = raw as { period: string; date?: string };
    const r = await getReport({ period: i.period, date: i.date }, ctx.now);
    const scopes = permittedScopes(ctx.settings);
    const trim = (m: typeof r.current) => ({
      ...m,
      health: scopes.has("health") ? m.health : "not shared with the assistant",
      money: scopes.has("finance") ? m.money : "not shared with the assistant",
      focus: { ...m.focus, byProject: m.focus.byProject.map((p) => ({ project: p.project ? r.projectNames[p.project] ?? "Removed project" : "No project", minutes: p.minutes })) },
    });
    return { data: { period: r.period, start: r.start, end: r.end, current: trim(r.current), previous: trim(r.previous), link: `/reports?period=${r.period}&date=${r.start}` }, count: 1, summary: `Read the ${r.period} report from ${r.start}` };
  },
});

const getWheel = read({
  name: "get_wheel_of_life", scope: "wheel",
  description: "The latest Wheel of Life check-in: each life area's score and desired score (1–10).",
  input: z.object({}),
  async run(ctx) {
    const [cats, latest] = await Promise.all([
      ctx.supabase.from("wheel_categories").select("id, name").is("archived_at", null),
      ctx.supabase.from("wheel_assessments").select("assessed_on, wheel_ratings(category_id, score, desired_score)").order("assessed_on", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const names = new Map((must(cats, "wheel areas") as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    if (latest.error) throw new Error("Couldn't read the Wheel of Life.");
    const a = latest.data as { assessed_on: string; wheel_ratings: { category_id: string; score: number; desired_score: number | null }[] } | null;
    if (!a) return { data: { note: "No check-ins yet." }, count: 0, summary: "No Wheel of Life check-ins" };
    return { data: { assessed_on: a.assessed_on, ratings: a.wheel_ratings.map((x) => ({ area: names.get(x.category_id) ?? "Removed area", score: x.score, desired: x.desired_score ?? undefined })), link: "/wheel" }, count: a.wheel_ratings.length, summary: `Read the ${a.assessed_on} Wheel of Life check-in` };
  },
});

const getReflection = read({
  name: "get_reflection", scope: "spirit",
  description: "The person's stated values and their daily reviews (morning, evening, weekly) from the last 14 days.",
  input: z.object({}),
  async run(ctx) {
    const [values, reviews] = await Promise.all([
      ctx.supabase.from("personal_values").select("name, description").order("sort_order").limit(30),
      ctx.supabase.from("daily_reviews").select("review_date, kind, achievements, unfinished, tomorrow_priorities, mood, energy").gte("review_date", addDays(ctx.today, -13)).order("review_date", { ascending: false }).limit(30),
    ]);
    const R = must(reviews, "reviews") as Record<string, unknown>[];
    return { data: { values: must(values, "values"), reviews: R, link: "/reflection" }, count: R.length, summary: `Read your values and ${R.length} review${R.length === 1 ? "" : "s"}` };
  },
});

const getFinance = read({
  name: "get_finance_overview", scope: "finance",
  description: "Account balances, this month's income and spending per currency, and bills due in the next 30 days. Amounts in different currencies are never added together.",
  input: z.object({}),
  async run(ctx) {
    const monthStart = `${ctx.today.slice(0, 7)}-01`;
    const [accounts, tx, bills] = await Promise.all([
      ctx.supabase.from("account_balances").select("account_id, name, kind, currency, is_liability, balance::text").limit(100),
      ctx.supabase.from("transactions").select("kind, amount::text, currency").in("kind", ["income", "expense"]).eq("is_pending", false).gte("occurred_on", monthStart).lte("occurred_on", ctx.today).limit(20000),
      ctx.supabase.from("recurring_transactions").select("description, amount::text, currency, next_due_on, is_subscription").is("archived_at", null).lte("next_due_on", addDays(ctx.today, 30)).order("next_due_on").limit(50),
    ]);
    const sums = new Map<string, { income: bigint; spent: bigint }>();
    for (const t of must(tx, "transactions") as { kind: string; amount: string; currency: string }[]) {
      const s = sums.get(t.currency) ?? { income: 0n, spent: 0n };
      const v = toMinor(t.amount, t.currency);
      if (t.kind === "income") s.income += v; else s.spent -= v;
      sums.set(t.currency, s);
    }
    const A = must(accounts, "accounts") as { name: string; kind: string; currency: string; is_liability: boolean; balance: string }[];
    const B = must(bills, "bills") as { description: string; amount: string; currency: string; next_due_on: string; is_subscription: boolean }[];
    return {
      data: {
        accounts: A.map((a) => ({ name: a.name, kind: a.kind, balance: `${a.balance} ${a.currency}`, liability: a.is_liability || undefined })),
        this_month: [...sums].map(([c, s]) => ({ currency: c, income: fromMinor(s.income, c), spent: fromMinor(s.spent, c), left: fromMinor(s.income - s.spent, c) })),
        bills_next_30_days: B.map((b) => ({ what: b.description, amount: `${b.amount.replace(/^-/, "")} ${b.currency}`, due: b.next_due_on, overdue: b.next_due_on < ctx.today || undefined, subscription: b.is_subscription || undefined })),
        link: "/finance",
      },
      count: A.length + B.length, summary: `Read ${A.length} account${A.length === 1 ? "" : "s"} and this month's money`,
    };
  },
});

const getHealth = read({
  name: "get_health_summary", scope: "health",
  description: "Check-ins (mood, energy, stress 1–5), sleep, workouts, water and the latest body measurements over the last N days. These are the person's own logs; never diagnose or label values as healthy or unhealthy.",
  input: z.object({ days: z.number().int().min(1).max(90).default(14) }),
  async run(ctx, i) {
    const from = addDays(ctx.today, -(i.days - 1));
    const [well, sleep, workouts, water, measures] = await Promise.all([
      ctx.supabase.from("wellness_logs").select("log_date, mood, energy, stress").gte("log_date", from).limit(1000),
      ctx.supabase.from("sleep_logs").select("sleep_date, bedtime, wake_time, duration_minutes, quality").gte("sleep_date", from).order("sleep_date").limit(200),
      ctx.supabase.from("workouts").select("performed_on, activity, duration_minutes, perceived_effort").gte("performed_on", from).order("performed_on").limit(200),
      ctx.supabase.from("hydration_logs").select("log_date, amount_ml").gte("log_date", from).limit(2000),
      ctx.supabase.from("body_measurements").select("metric, value::text, unit, measured_at").order("measured_at", { ascending: false }).limit(200),
    ]);
    const W = must(well, "check-ins") as { log_date: string; mood: number | null; energy: number | null; stress: number | null }[];
    const avg = (k: "mood" | "energy" | "stress") => { const xs = W.map((w) => w[k]).filter((x): x is number => x !== null); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null; };
    const S = must(sleep, "sleep") as { sleep_date: string; bedtime: string; wake_time: string; duration_minutes: number; quality: number | null }[];
    const H = new Map<string, number>();
    for (const h of must(water, "water") as { log_date: string; amount_ml: number }[]) H.set(h.log_date, (H.get(h.log_date) ?? 0) + h.amount_ml);
    const latest = new Map<string, { value: string; unit: string; on: string }>();
    for (const m of must(measures, "measurements") as { metric: string; value: string; unit: string; measured_at: string }[]) if (!latest.has(m.metric)) latest.set(m.metric, { value: m.value, unit: m.unit, on: localDateKey(new Date(m.measured_at), ctx.timezone) });
    return {
      data: {
        days: i.days, from, to: ctx.today,
        checkins: { days_logged: new Set(W.map((w) => w.log_date)).size, average_mood: avg("mood"), average_energy: avg("energy"), average_stress: avg("stress") },
        sleep: S.map((n) => ({ woke_on: n.sleep_date, slept: `${Math.floor(n.duration_minutes / 60)}h ${n.duration_minutes % 60}m`, bed: formatTime(n.bedtime, ctx.timezone, "en-GB"), wake: formatTime(n.wake_time, ctx.timezone, "en-GB"), rested: n.quality ?? undefined })),
        workouts: must(workouts, "workouts"),
        water_ml_by_day: Object.fromEntries(H),
        latest_measurements: Object.fromEntries(latest),
        link: "/health",
      },
      count: W.length + S.length, summary: `Read ${i.days} days of health logs`,
    };
  },
});

const listJournal = read({
  name: "list_journal_entries", scope: "journal",
  description: "Journal entries the person has marked as shareable with the assistant, between two dates (at most 31 days). Private entries are never returned.",
  input: z.object({ from: dateKey, to: dateKey }),
  async run(ctx, raw) {
    const i = raw as { from: string; to: string };
    if (i.to < i.from || diffDays(i.from, i.to) > 31) throw new Error("Use a range of at most 31 days.");
    const rows = must(await ctx.supabase.from("journal_entries").select("entry_date, kind, title, body, mood").eq("ai_access_allowed", true).eq("is_private", false).is("archived_at", null).gte("entry_date", i.from).lte("entry_date", i.to).order("entry_date").limit(31), "journal") as { entry_date: string; kind: string; title: string | null; body: string; mood: number | null }[];
    const data = rows.map((r) => ({ ...r, body: clip(r.body, 2000), link: "/reflection" }));
    return { data, count: data.length, summary: `Read ${data.length} shared journal entr${data.length === 1 ? "y" : "ies"}` };
  },
});

/* ------------------------------------------------------------------------ */
/* Proposal tools: nothing is written until the person confirms             */
/* ------------------------------------------------------------------------ */

export const proposeTaskInput = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(2000).optional(),
  due_date: dateKey.optional(),
  due_time: timeKey.optional(),
  priority: z.number().int().min(1).max(4).optional().describe("1 urgent, 2 high, 3 normal, 4 low"),
});
const proposeTask = propose({
  name: "propose_task", scope: "tasks",
  description: "Suggest a new task. It is NOT created: the person sees it and confirms or declines.",
  input: proposeTaskInput,
  async prepare(ctx, i) {
    if (i.due_time && !i.due_date) return { ok: false, error: "A due time needs a due date." };
    return { ok: true, summary: `Add task “${i.title}”${i.due_date ? `, due ${i.due_date}${i.due_time ? ` at ${i.due_time}` : ""}` : ""}` };
  },
});

export const proposeCompleteInput = z.object({ task_id: uuid.describe("The id from list_tasks") });
const proposeComplete = propose({
  name: "propose_complete_task", scope: "tasks",
  description: "Suggest marking an open task as done. Nothing changes until the person confirms.",
  input: proposeCompleteInput,
  async prepare(ctx, i) {
    const { data } = await ctx.supabase.from("tasks").select("title, status").eq("id", i.task_id).maybeSingle();
    if (!data) return { ok: false, error: "That task wasn't found." };
    if (data.status === "done") return { ok: false, error: "That task is already done." };
    return { ok: true, summary: `Mark “${data.title}” as done` };
  },
});

export const proposeEventInput = z.object({
  title: z.string().trim().min(1).max(300),
  date: dateKey,
  start_time: timeKey.optional(),
  end_time: timeKey.optional(),
  all_day: z.boolean().default(false),
  location: z.string().trim().max(300).optional(),
  time_block: z.boolean().default(false).describe("True to block focus time rather than add an event"),
});
const proposeEvent = propose({
  name: "propose_event", scope: "calendar",
  description: "Suggest a calendar event or a focus time block on one day. Timed events need start and end times. Nothing is added until the person confirms.",
  input: proposeEventInput,
  async prepare(ctx, i) {
    if (!i.all_day && (!i.start_time || !i.end_time)) return { ok: false, error: "A timed event needs a start and end time." };
    if (!i.all_day && i.end_time! <= i.start_time!) return { ok: false, error: "The end time must be after the start time." };
    return { ok: true, summary: `${i.time_block ? "Block time for" : "Add event"} “${i.title}” on ${i.date}${i.all_day ? " (all day)" : `, ${i.start_time}–${i.end_time}`}` };
  },
});

export const proposeHabitInput = z.object({ habit_id: uuid.describe("The id from list_habits"), date: dateKey });
const proposeHabit = propose({
  name: "propose_habit_checkin", scope: "habits",
  description: "Suggest checking in a habit for a day the person says they did it. Nothing is logged until they confirm.",
  input: proposeHabitInput,
  async prepare(ctx, i) {
    if (i.date > ctx.today) return { ok: false, error: "Habits can't be checked in for future days." };
    const { data } = await ctx.supabase.from("habits").select("name").eq("id", i.habit_id).is("archived_at", null).maybeSingle();
    if (!data) return { ok: false, error: "That habit wasn't found." };
    return { ok: true, summary: `Check in “${data.name}” for ${i.date}` };
  },
});

export const ALL_TOOLS: AnyTool[] = [
  listTasks, listEvents, listHabits, listGoals, listProjects, listLearning, listPeople, listAdmin, searchNotes, getReportTool, getWheel, getReflection, getFinance, getHealth, listJournal,
  proposeTask, proposeComplete, proposeEvent, proposeHabit,
];

/** Only the tools for areas the person has shared; anything else doesn't exist for the model. */
export function toolsFor(settings: AiSettings): AnyTool[] {
  const scopes = permittedScopes(settings);
  return ALL_TOOLS.filter((t) => scopes.has(t.scope));
}

export function toApiTool(t: AnyTool): Anthropic.Tool {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  return { name: t.name, description: t.description, input_schema: { type: "object", ...schema } as Anthropic.Tool.InputSchema };
}

