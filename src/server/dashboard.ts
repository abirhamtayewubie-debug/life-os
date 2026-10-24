import "server-only";
import { expandEvents } from "@/lib/calendar";
import { addDays, localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { generateSampleSet, sampleToRaw } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDashboard, type DashboardModel } from "@/features/dashboard/compute";
import type { RawLifeData } from "@/features/dashboard/types";
import { normalizeLayout, type WidgetPref } from "@/features/dashboard/widgets";
import { weekView } from "@/features/dashboard/week";
import { getReport } from "./reports";
import { getViewer, type Viewer } from "./viewer";

export type DashboardPayload = {
  viewer: Viewer;
  model: DashboardModel;
  layout: WidgetPref[];
  hasAnyData: boolean;
  hasSampleData: boolean;
};

export async function getDashboard(now = new Date()): Promise<DashboardPayload> {
  const viewer = await getViewer();
  if (viewer.mode === "demo") {
    const raw = sampleToRaw(generateSampleSet(now, viewer.profile.timezone, viewer.profile.baseCurrency));
    return { viewer, model: { ...buildDashboard(raw, now, viewer.profile), week: await loadWeek(now) }, layout: normalizeLayout(null), hasAnyData: true, hasSampleData: true };
  }

  const [raw, layout, week] = await Promise.all([loadLifeData(viewer, now), loadLayout(), loadWeek(now)]);
  const all = Object.values(raw).flat() as { source?: string }[];
  return {
    viewer,
    model: { ...buildDashboard(raw, now, viewer.profile), week },
    layout,
    hasAnyData: all.length > 0,
    hasSampleData: all.some((r) => r.source === "sample"),
  };
}

/** This week so far, from the same counts as Reports. Today still loads if it fails. */
async function loadWeek(now: Date) {
  try {
    const r = await getReport({ period: "weekly" }, now);
    return weekView(r.current, r.end);
  } catch {
    return null;
  }
}

async function loadLayout(): Promise<WidgetPref[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("dashboard_widgets").select("widget_key, size, visible, sort_order").order("sort_order");
  return normalizeLayout(data?.map((r) => ({ key: r.widget_key, size: r.size, visible: r.visible })) as WidgetPref[] | undefined);
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

async function loadLifeData(viewer: Extract<Viewer, { mode: "live" }>, now: Date): Promise<RawLifeData> {
  const supabase = await createSupabaseServerClient();
  const tz = viewer.profile.timezone;
  const today = localDateKey(now, tz);
  const windowStart = zonedTimeToUtc(addDays(today, -1), "00:00", tz).toISOString();
  const windowEnd = zonedTimeToUtc(addDays(today, 9), "00:00", tz).toISOString();
  const lastMonthStart = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;

  const taskCols = "id, title, status, priority, area, due_date, due_at, is_top_priority, completed_at, project_id, goal_id, created_at, source";

  const [
    openTasks, recentDone, projects, events, reminders, habits, habitLogs, goals, balances, accounts,
    categories, budgets, transactions, wellness, sleep, wheelCats, wheelAssess, journal, notes, reviews,
  ] = await Promise.all([
    supabase.from("tasks").select(taskCols).is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]).limit(1000),
    supabase.from("tasks").select(taskCols).is("archived_at", null).eq("status", "done").gte("completed_at", zonedTimeToUtc(addDays(today, -7), "00:00", tz).toISOString()).limit(500),
    supabase.from("projects").select("id, name, status, area, due_date, source").eq("status", "active").is("archived_at", null),
    // Single events in the window, plus every repeating series that has started; expanded below.
    supabase.from("calendar_events").select("id, title, kind, starts_at, ends_at, all_day, location, timezone, recurrence_rule, source").is("archived_at", null)
      .or(`recurrence_rule.not.is.null,and(starts_at.lt.${windowEnd},ends_at.gt.${windowStart})`).lt("starts_at", windowEnd).order("starts_at").limit(500),
    supabase.from("reminders").select("id, title, remind_at, status, snoozed_until, source").in("status", ["scheduled", "snoozed"]).lt("remind_at", windowEnd).limit(200),
    supabase.from("habits").select("id, name, cadence, schedule_days, target_per_period, time_of_day, paused_at, created_at, source").is("archived_at", null),
    supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", addDays(today, -45)),
    supabase.from("goals").select("id, title, level, status, target_date, metric_label, metric_target::text, metric_current::text, wheel_category_id, updated_at, source").eq("status", "active").is("archived_at", null),
    supabase.from("account_balances").select("account_id, name, kind, currency, is_liability, balance::text"),
    supabase.from("financial_accounts").select("id, source, include_in_net_worth").is("archived_at", null),
    supabase.from("transaction_categories").select("id, name, kind, parent_id").is("archived_at", null),
    supabase.from("budgets").select("id, name, period, currency, source, budget_lines(category_id, amount::text)").is("archived_at", null).lte("starts_on", today),
    supabase.from("transactions").select("id, account_id, category_id, kind, amount::text, currency, occurred_on, description, source").gte("occurred_on", lastMonthStart).lte("occurred_on", today).limit(5000),
    supabase.from("wellness_logs").select("log_date, mood, energy, stress, source").gte("log_date", addDays(today, -7)),
    supabase.from("sleep_logs").select("sleep_date, bedtime, wake_time, duration_minutes, quality, source").gte("sleep_date", addDays(today, -7)),
    supabase.from("wheel_categories").select("id, name, sort_order").is("archived_at", null),
    supabase.from("wheel_assessments").select("id, assessed_on, source, wheel_ratings(category_id, score, desired_score)").order("assessed_on", { ascending: false }).limit(2),
    supabase.from("journal_entries").select("id, entry_date, kind, title, is_private, source").is("archived_at", null).order("entry_date", { ascending: false }).limit(3),
    supabase.from("notes").select("id, title, kind, updated_at, source").is("archived_at", null).order("updated_at", { ascending: false }).limit(3),
    supabase.from("daily_reviews").select("review_date, kind, achievements, unfinished, tomorrow_priorities, mood, energy, notes").gte("review_date", addDays(today, -1)),
  ]);

  const activeProjects = must(projects, "projects") as RawLifeData["projects"];
  let projectTasks: RawLifeData["tasks"] = [];
  let milestones: NonNullable<RawLifeData["milestones"]> = [];
  if (activeProjects.length) {
    const ids = activeProjects.map((p) => p.id);
    const [pt, ms] = await Promise.all([
      supabase.from("tasks").select(taskCols).is("archived_at", null).in("project_id", ids).limit(2000),
      supabase.from("milestones").select("id, project_id, title, due_date, completed_at").in("project_id", ids).is("completed_at", null).limit(500),
    ]);
    projectTasks = must(pt, "project tasks") as RawLifeData["tasks"];
    milestones = must(ms, "milestones") as NonNullable<RawLifeData["milestones"]>;
  }
  const taskMap = new Map<string, RawLifeData["tasks"][number]>();
  for (const t of [...(must(openTasks, "tasks") as RawLifeData["tasks"]), ...(must(recentDone, "tasks") as RawLifeData["tasks"]), ...projectTasks]) taskMap.set(t.id, t);

  const accountMeta = new Map((must(accounts, "accounts") as { id: string; source: RawLifeData["accounts"][number]["source"]; include_in_net_worth: boolean }[]).map((a) => [a.id, a]));
  type BalanceRow = { account_id: string; name: string; kind: string; currency: string; is_liability: boolean; balance: number | string };
  type BudgetRow = { id: string; name: string; period: "weekly" | "monthly"; currency: string; source: RawLifeData["budgets"][number]["source"]; budget_lines: { category_id: string; amount: number | string }[] };
  type AssessRow = { id: string; assessed_on: string; source: RawLifeData["wheelAssessments"][number]["source"]; wheel_ratings: { category_id: string; score: number; desired_score: number | null }[] };

  return {
    tasks: [...taskMap.values()],
    events: expandEvents(must(events, "events") as (RawLifeData["events"][number] & { timezone: string; recurrence_rule: string | null })[], addDays(today, -1), addDays(today, 8), tz)
      .map(({ eventId: _e, occurrenceDate: _o, recurring: _r, series_starts_at: _s, series_ends_at: _x, timezone: _t, recurrence_rule: _rr, ...ev }) => ev),
    reminders: must(reminders, "reminders") as RawLifeData["reminders"],
    habits: must(habits, "habits") as RawLifeData["habits"],
    habitLogs: must(habitLogs, "habit logs") as RawLifeData["habitLogs"],
    goals: must(goals, "goals") as RawLifeData["goals"],
    projects: activeProjects,
    milestones,
    accounts: (must(balances, "balances") as BalanceRow[])
      .filter((b) => accountMeta.get(b.account_id)?.include_in_net_worth !== false)
      .map((b) => ({ id: b.account_id, name: b.name, kind: b.kind, currency: b.currency, is_liability: b.is_liability, balance: String(b.balance), source: accountMeta.get(b.account_id)?.source ?? "manual" })),
    categories: must(categories, "categories") as RawLifeData["categories"],
    budgets: (must(budgets, "budgets") as BudgetRow[]).map((b) => ({
      id: b.id, name: b.name, period: b.period, currency: b.currency, source: b.source,
      lines: b.budget_lines.map((l) => ({ category_id: l.category_id, amount: String(l.amount) })),
    })),
    transactions: (must(transactions, "transactions") as (RawLifeData["transactions"][number] & { amount: number | string })[]).map((t) => ({ ...t, amount: String(t.amount) })),
    wellness: must(wellness, "wellness") as RawLifeData["wellness"],
    sleep: must(sleep, "sleep") as RawLifeData["sleep"],
    wheelCategories: must(wheelCats, "wheel categories") as RawLifeData["wheelCategories"],
    wheelAssessments: (must(wheelAssess, "wheel assessments") as AssessRow[]).map((a) => ({ id: a.id, assessed_on: a.assessed_on, source: a.source, ratings: a.wheel_ratings })),
    journal: must(journal, "journal") as RawLifeData["journal"],
    notes: must(notes, "notes") as RawLifeData["notes"],
    reviews: must(reviews, "reviews") as RawLifeData["reviews"],
  };
}
