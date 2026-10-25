import "server-only";
import { computeHabit, isScheduled } from "@/features/dashboard/compute";
import type { RawHabit, RawHabitLog } from "@/features/dashboard/types";
import { dueStatus } from "@/features/admin/status";
import { contactState, upcomingDates } from "@/features/relationships/dates";
import { addDays, formatShortDate, localDateKey, relativeDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { generateSampleSet, sampleToRaw } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminWorkspace } from "./admin";
import { getDashboard } from "./dashboard";
import { getHealthWorkspace } from "./health";
import { getLearningWorkspace } from "./learning";
import { getRelationshipsWorkspace } from "./relationships";
import { getViewer } from "./viewer";

/** Up to three short lines of live status per module key; phones show the first. */
export type AreaStatus = Record<string, string[]>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Each area loads independently, so one failing module never blanks the page. */
async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function getAreaStatus(now = new Date()): Promise<AreaStatus> {
  const [dash, learning, people, admin, health] = await Promise.all([
    safe(getDashboard(now)),
    safe(getLearningWorkspace(now)),
    safe(getRelationshipsWorkspace(now)),
    safe(getAdminWorkspace(now)),
    safe(getHealthWorkspace(now)),
  ]);
  const out: AreaStatus = {};

  if (dash) {
    const m = dash.model;
    const locale = dash.viewer.profile.locale;
    const today = m.todayKey;

    const next = m.agenda.find((e) => !e.all_day && new Date(e.ends_at) > now) ?? m.upcoming[0];
    out.calendar = [
      `${m.agenda.length} today`,
      next ? `Next: ${next.title}` : "Nothing coming up",
      ...(next && next.dateKey !== today ? [formatShortDate(next.dateKey, locale)] : next && !next.all_day ? [next.timeLabel.split(" – ")[0]!] : []),
    ];

    out.tasks = [
      `${m.stats.openTasks} open`,
      m.overdue.length ? `${m.overdue.length} late` : "Nothing late",
      ...(m.dueSoon.length ? [`${m.dueSoon.length} due soon`] : []),
    ];

    const late = m.projects.find((p) => p.risk === "late");
    const milestone = m.projects.find((p) => p.nextMilestone)?.nextMilestone;
    out.work = [
      `${m.projects.length} active`,
      ...(late ? [`${late.name} is behind`] : []),
      ...(milestone ? [`${milestone.title} · ${relativeDay(milestone.dueDate, today)}`] : []),
    ].slice(0, 3);

    const top = m.goals.find((g) => g.pct !== null);
    out.goals = [`${m.goals.length} active`, ...(top ? [`${top.title} · ${top.pct}%`] : [])];

    const { habitsDoneToday: hd, habitsScheduledToday: hs } = m.stats;
    const best = [...m.habits].sort((a, b) => b.streak - a.streak)[0];
    out.habits = [hs ? `${hd} / ${hs}` : "None today", ...(best && best.streak > 1 ? [`${best.name} · ${best.streak} days`] : [])];

    const entry = m.journal[0];
    out.spirit = [
      m.eveningReview ? "Reviewed today" : "Journal",
      ...(entry ? [`Last entry ${relativeDay(entry.entry_date, today)}`] : []),
    ];

    const f = m.finance;
    if (f?.hasData) {
      const over = f.budgets.some((b) => b.lines.some((l) => l.status === "over"));
      const watch = f.budgets.some((b) => b.pacePct > 0 && b.pct > b.pacePct);
      out.finance = [
        !f.budgets.length ? "No budget yet" : over ? "Over budget" : watch ? "Watch budget" : "On budget",
        ...(f.monthSpendByCurrency[0] ? [`${formatMoney(f.monthSpendByCurrency[0], locale, { compact: true })} spent this month`] : []),
        ...(f.topCategories[0] ? [`Most on ${f.topCategories[0].name}`] : []),
      ];
    }

    if (m.week) out.reports = ["This week", `${plural(m.week.daysWithData, "day")} with data`];
    if (m.notes[0]) out.knowledge = [plural(m.notes.length, "recent note"), m.notes[0].title];
  }

  if (learning) {
    const active = learning.items.filter((i) => i.status === "in_progress");
    const first = active[0];
    out.learning = [
      active.length ? `${active.length} in progress` : `${learning.items.length} saved`,
      ...(first ? [`${first.title}${first.progress_pct !== null ? ` · ${first.progress_pct}%` : ""}`] : []),
      ...(learning.roadmaps.length ? [plural(learning.roadmaps.length, "roadmap")] : []),
    ];
  }

  if (people) {
    const due = people.people
      .map((p) => ({ p, s: contactState(p, people.today) }))
      .filter((x) => x.s.status === "due" || x.s.status === "never")
      .sort((a, b) => b.s.overdueDays - a.s.overdueDays);
    const soon = upcomingDates(people.people, people.dates, people.today, 30)[0];
    out.relationships = [
      due[0] ? `${due[0].p.name.split(" ")[0]} · catch up` : plural(people.people.length, "person", "people"),
      ...(soon ? [`${soon.title} ${relativeDay(soon.on, people.today)}`] : []),
      ...(due.length > 1 ? [`${due.length} to catch up with`] : []),
    ];
  }

  if (admin) {
    const open = admin.items
      .map((i) => ({ i, d: dueStatus(i, admin.today) }))
      .filter((x) => x.d.status === "overdue" || x.d.status === "soon")
      .sort((a, b) => (a.d.inDays ?? 0) - (b.d.inDays ?? 0));
    const chores = admin.routines.filter((r) => r.due_date && r.due_date <= addDays(admin.today, 7)).length;
    out.admin = [
      open.length ? `${open.length} due soon` : chores ? plural(chores, "chore") : "All clear",
      ...(open[0] ? [`${open[0].i.title} · ${open[0].d.inDays !== null ? relativeDay(addDays(admin.today, open[0].d.inDays), admin.today) : ""}`] : []),
      ...(chores && open.length ? [plural(chores, "chore")] : []),
    ];
  }

  if (health) {
    const weekAgo = addDays(health.today, -6);
    const workouts = health.workouts.filter((w) => w.performed_on >= weekAgo).length;
    const nights = health.sleep.filter((s) => s.sleep_date >= weekAgo);
    const avg = nights.length ? Math.round(nights.reduce((a, s) => a + s.duration_minutes, 0) / nights.length) : null;
    out.health = [
      plural(workouts, "workout"),
      ...(avg !== null ? [`Sleep ${Math.floor(avg / 60)}h ${avg % 60}m avg`] : []),
      "Last 7 days",
    ];
  }

  return out;
}

/** Small counts for the desktop sidebar, cheap enough to load on every page. */
export async function getNavCounts(now = new Date()): Promise<Record<string, string>> {
  const viewer = await getViewer();
  const tz = viewer.profile.timezone;
  const today = localDateKey(now, tz);
  const habitCount = (habits: RawHabit[], logs: RawHabitLog[]) => {
    const scheduled = habits.filter((h) => !h.paused_at && isScheduled(h, today));
    const done = scheduled.filter((h) => computeHabit(h, logs, today, tz).doneToday).length;
    return scheduled.length ? `${done}/${scheduled.length}` : undefined;
  };

  if (viewer.mode === "demo") {
    const raw = sampleToRaw(generateSampleSet(now, tz, viewer.profile.baseCurrency));
    const counts: Record<string, string | undefined> = {
      tasks: String(raw.tasks.filter((t) => ["todo", "in_progress", "waiting"].includes(t.status)).length),
      work: String(raw.projects.filter((p) => p.status === "active").length),
      habits: habitCount(raw.habits, raw.habitLogs),
    };
    return Object.fromEntries(Object.entries(counts).filter((e): e is [string, string] => !!e[1]));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [tasks, projects, habits, logs] = await Promise.all([
      supabase.from("tasks").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]),
      supabase.from("projects").select("id", { count: "exact", head: true }).is("archived_at", null).eq("status", "active"),
      supabase.from("habits").select("id, name, cadence, schedule_days, target_per_period, time_of_day, paused_at, created_at, source").is("archived_at", null),
      supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", addDays(today, -7)),
    ]);
    const counts: Record<string, string> = {};
    if (tasks.count) counts.tasks = String(tasks.count);
    if (projects.count) counts.work = String(projects.count);
    const h = habits.data && logs.data ? habitCount(habits.data as RawHabit[], logs.data as RawHabitLog[]) : undefined;
    if (h) counts.habits = h;
    return counts;
  } catch {
    return {};
  }
}
