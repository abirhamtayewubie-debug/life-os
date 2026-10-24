import { addDays, diffDays, formatShortDate, formatTime, localDateKey, weekdayOf } from "@/lib/dates";
import { formatMoney, percentOf, sumMoney, toMinor, totalsByCurrency, type Money } from "@/lib/money";
import type {
  DataSource, RawAccount, RawEvent, RawHabit, RawHabitLog, RawLifeData, RawReview, RawTask, ViewerProfile,
} from "./types";

/* ------------------------------------------------------------------------ */
/* Model                                                                     */
/* ------------------------------------------------------------------------ */

export type TaskView = RawTask & { dueLabel: string | null; dueKey: string | null; daysOverdue: number; late: boolean };
export type EventView = RawEvent & { timeLabel: string; dateKey: string };

export type HabitDay = { date: string; state: "done" | "missed" | "off" | "future" | "before" };
export type HabitView = {
  id: string;
  name: string;
  timeOfDay: RawHabit["time_of_day"];
  scheduledToday: boolean;
  doneToday: boolean;
  last7: HabitDay[];
  /** Done ÷ scheduled over the last 30 days (since creation). null when nothing was scheduled. */
  consistency30: number | null;
  scheduled30: number;
  streak: number;
  source: DataSource;
};

export type BudgetLineView = { categoryName: string; spent: Money; limit: Money; pct: number; status: "ok" | "watch" | "over" };
export type BudgetView = { id: string; name: string; currency: string; spent: Money; limit: Money; pct: number; pacePct: number; lines: BudgetLineView[]; source: DataSource };

export type FinanceView = {
  accounts: (RawAccount & { balanceMoney: Money })[];
  netByCurrency: Money[];
  monthSpendByCurrency: Money[];
  monthIncomeByCurrency: Money[];
  budgets: BudgetView[];
  topCategories: { name: string; spent: Money }[];
  hasData: boolean;
};

export type WheelView = {
  assessedOn: string;
  previousOn: string | null;
  ratings: { categoryId: string; name: string; score: number; desired: number | null; previous: number | null }[];
  lowest: string[];
  highest: string[];
  source: DataSource;
};

export type ChangeItem = { id: string; tone: "neutral" | "positive" | "attention"; text: string };
export type Suggestion = { id: string; text: string; evidence: string; href: string };

export type DashboardModel = {
  todayKey: string;
  priorities: TaskView[];
  agenda: EventView[];
  upcoming: EventView[];
  overdue: TaskView[];
  dueSoon: TaskView[];
  reminders: { id: string; title: string; at: string; timeLabel: string; snoozed: boolean; source: DataSource }[];
  habits: HabitView[];
  goals: (RawLifeData["goals"][number] & { pct: number | null })[];
  projects: {
    id: string; name: string; area: string; status: string; dueDate: string | null; open: number; done: number; pct: number | null;
    risk: "none" | "watch" | "late";
    /** Open top-level tasks marked Blocked (the `waiting` status). */
    blocked: number;
    /** Open tasks past their deadline. */
    overdue: number;
    nextMilestone: { title: string; dueDate: string } | null;
    source: DataSource;
  }[];
  finance: FinanceView | null;
  wellness: { days: { date: string; mood: number | null; energy: number | null }[]; source: DataSource } | null;
  sleep: { nights: { date: string; minutes: number; quality: number | null }[]; avgMinutes: number | null; avgQuality: number | null; source: DataSource } | null;
  wheel: WheelView | null;
  journal: RawLifeData["journal"];
  notes: RawLifeData["notes"];
  changes: ChangeItem[];
  briefing: { lines: string[]; suggestedPriorities: TaskView[] };
  suggestions: Suggestion[];
  eveningReview: RawReview | null;
  stats: { openTasks: number; doneToday: number; habitsDoneToday: number; habitsScheduledToday: number };
};

const OPEN: RawTask["status"][] = ["todo", "in_progress", "waiting"];
const isOpen = (t: RawTask) => OPEN.includes(t.status);

/* ------------------------------------------------------------------------ */
/* Tasks & events                                                            */
/* ------------------------------------------------------------------------ */

export function taskDueKey(t: Pick<RawTask, "due_date" | "due_at">, tz: string): string | null {
  if (t.due_date) return t.due_date;
  if (t.due_at) return localDateKey(new Date(t.due_at), tz);
  return null;
}

function toTaskView(t: RawTask, now: Date, todayKey: string, tz: string, locale: string): TaskView {
  const dueKey = taskDueKey(t, tz);
  let dueLabel: string | null = null;
  let daysOverdue = 0;
  if (dueKey) {
    const d = diffDays(todayKey, dueKey);
    daysOverdue = d < 0 ? -d : 0;
    if (t.due_at && d === 0) dueLabel = new Date(t.due_at) < now ? `overdue since ${formatTime(t.due_at, tz, locale)}` : `today ${formatTime(t.due_at, tz, locale)}`;
    else if (d === 0) dueLabel = "today";
    else if (d === 1) dueLabel = "tomorrow";
    else if (d === -1) dueLabel = "yesterday";
    else if (d < 0) dueLabel = `${-d} days overdue`;
    else dueLabel = `in ${d} days`;
  }
  return { ...t, dueKey, dueLabel, daysOverdue, late: isOverdue(t, now, todayKey, tz) };
}

export function isOverdue(t: RawTask, now: Date, todayKey: string, tz: string): boolean {
  if (!isOpen(t)) return false;
  if (t.due_at) return new Date(t.due_at) < now;
  const k = taskDueKey(t, tz);
  return k !== null && k < todayKey;
}

function eventDateKey(e: RawEvent, tz: string) {
  return e.all_day ? e.starts_at.slice(0, 10) : localDateKey(new Date(e.starts_at), tz);
}

/** Events that overlap the given local day. */
export function eventsOnDay(events: RawEvent[], dayKey: string, tz: string): RawEvent[] {
  return events
    .filter((e) => {
      if (e.all_day) return e.starts_at.slice(0, 10) <= dayKey && e.ends_at.slice(0, 10) >= dayKey;
      const s = localDateKey(new Date(e.starts_at), tz);
      const en = localDateKey(new Date(new Date(e.ends_at).getTime() - 1), tz);
      return s <= dayKey && en >= dayKey;
    })
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
}

/** Pairs of timed events on the same day that overlap. */
export function findConflicts(events: RawEvent[]): [RawEvent, RawEvent][] {
  const timed = events.filter((e) => !e.all_day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const out: [RawEvent, RawEvent][] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].starts_at >= timed[i].ends_at) break;
      out.push([timed[i], timed[j]]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Habits                                                                    */
/* ------------------------------------------------------------------------ */

export function isScheduled(h: RawHabit, dayKey: string): boolean {
  if (h.cadence === "weekly") return true; // weekly targets count any day
  return h.schedule_days.includes(weekdayOf(dayKey));
}

export function computeHabit(h: RawHabit, logs: RawHabitLog[], todayKey: string, tz: string): HabitView {
  const byDate = new Map<string, number>();
  for (const l of logs) if (l.habit_id === h.id) byDate.set(l.log_date, (byDate.get(l.log_date) ?? 0) + l.count);
  const createdKey = localDateKey(new Date(h.created_at), tz);
  const dailyTarget = h.cadence === "daily" ? h.target_per_period : 1;
  const done = (k: string) => (byDate.get(k) ?? 0) >= dailyTarget;

  const last7: HabitDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(todayKey, -i);
    let state: HabitDay["state"];
    if (k < createdKey) state = "before";
    else if (done(k)) state = "done";
    else if (h.cadence === "daily" && !isScheduled(h, k)) state = "off";
    else if (k === todayKey) state = "future";
    else state = h.cadence === "daily" ? "missed" : "off";
    last7.push({ date: k, state });
  }

  let scheduled30 = 0;
  let done30 = 0;
  if (h.cadence === "daily") {
    // Window: the 30 days before today, plus today only if already done.
    for (let i = 30; i >= 0; i--) {
      const k = addDays(todayKey, -i);
      if (k < createdKey || !isScheduled(h, k)) continue;
      if (i === 0 && !done(k)) continue;
      scheduled30++;
      if (done(k)) done30++;
    }
  } else {
    // Weekly: compare completions against target over the last 4 full weeks.
    for (let w = 1; w <= 4; w++) {
      let count = 0;
      for (let d = 0; d < 7; d++) {
        const k = addDays(todayKey, -(w * 7) + d);
        if (k >= createdKey) count += byDate.get(k) ?? 0;
      }
      if (addDays(todayKey, -(w * 7)) < createdKey) continue;
      scheduled30 += h.target_per_period;
      done30 += Math.min(count, h.target_per_period);
    }
  }

  let streak = 0;
  if (h.cadence === "daily") {
    let k = done(todayKey) ? todayKey : addDays(todayKey, -1);
    for (let guard = 0; guard < 400 && k >= createdKey; guard++) {
      if (!isScheduled(h, k)) { k = addDays(k, -1); continue; }
      if (!done(k)) break;
      streak++;
      k = addDays(k, -1);
    }
  }

  return {
    id: h.id,
    name: h.name,
    timeOfDay: h.time_of_day,
    scheduledToday: isScheduled(h, todayKey),
    doneToday: done(todayKey),
    last7,
    consistency30: scheduled30 ? Math.round((done30 / scheduled30) * 100) : null,
    scheduled30,
    streak,
    source: h.source,
  };
}

/* ------------------------------------------------------------------------ */
/* Finance                                                                   */
/* ------------------------------------------------------------------------ */

function monthBounds(todayKey: string) {
  const [y, m] = todayKey.split("-").map(Number);
  const start = `${todayKey.slice(0, 7)}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, daysInMonth, day: Number(todayKey.slice(8, 10)) };
}

export function computeFinance(d: RawLifeData, todayKey: string): FinanceView | null {
  if (!d.accounts.length && !d.transactions.length) return null;
  const { start, daysInMonth, day } = monthBounds(todayKey);
  const monthTx = d.transactions.filter((t) => t.occurred_on >= start && t.occurred_on <= todayKey);
  const expenses = monthTx.filter((t) => t.kind === "expense");
  const catName = new Map(d.categories.map((c) => [c.id, c.name]));
  const abs = (m: Money): Money => ({ ...m, amount: m.amount.replace(/^-/, "") });

  const budgets: BudgetView[] = d.budgets
    .filter((b) => b.period === "monthly")
    .map((b) => {
      const lines: BudgetLineView[] = b.lines.map((l) => {
        const spent = sumMoney(
          expenses.filter((t) => t.category_id === l.category_id && t.currency === b.currency).map((t) => abs(t)),
          b.currency,
        );
        const limit = { amount: l.amount, currency: b.currency };
        const pct = percentOf(spent, limit);
        const pace = (day / daysInMonth) * 100;
        return {
          categoryName: catName.get(l.category_id) ?? "Uncategorised",
          spent, limit, pct,
          status: pct >= 100 ? "over" : pct > pace + 10 ? "watch" : "ok",
        } as BudgetLineView;
      });
      const spent = sumMoney(lines.map((l) => l.spent), b.currency);
      const limit = sumMoney(lines.map((l) => l.limit), b.currency);
      return { id: b.id, name: b.name, currency: b.currency, spent, limit, pct: percentOf(spent, limit), pacePct: Math.round((day / daysInMonth) * 100), lines, source: b.source };
    });

  const byCat = new Map<string, Money[]>();
  for (const t of expenses) {
    const key = `${t.category_id ?? "none"}|${t.currency}`;
    byCat.set(key, [...(byCat.get(key) ?? []), abs(t)]);
  }
  const topCategories = [...byCat.entries()]
    .map(([key, items]) => {
      const [cid, cur] = key.split("|");
      return { name: catName.get(cid) ?? "Uncategorised", spent: sumMoney(items, cur) };
    })
    .sort((a, b) => Number(toMinor(b.spent.amount, b.spent.currency) - toMinor(a.spent.amount, a.spent.currency)))
    .slice(0, 5);

  const accounts = d.accounts.map((a) => ({ ...a, balanceMoney: { amount: a.balance, currency: a.currency } }));
  return {
    accounts,
    netByCurrency: totalsByCurrency(accounts.map((a) => a.balanceMoney)),
    monthSpendByCurrency: totalsByCurrency(expenses.map(abs)),
    monthIncomeByCurrency: totalsByCurrency(monthTx.filter((t) => t.kind === "income")),
    budgets,
    topCategories,
    hasData: true,
  };
}

/* ------------------------------------------------------------------------ */
/* Assembly                                                                  */
/* ------------------------------------------------------------------------ */

function dominantSource(items: { source: DataSource }[]): DataSource {
  if (!items.length) return "manual";
  if (items.every((i) => i.source === "sample")) return "sample";
  const counts = new Map<DataSource, number>();
  for (const i of items) counts.set(i.source, (counts.get(i.source) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function buildDashboard(d: RawLifeData, now: Date, profile: ViewerProfile): DashboardModel {
  const tz = profile.timezone;
  const locale = profile.locale;
  const todayKey = localDateKey(now, tz);
  const yesterdayKey = addDays(todayKey, -1);
  const tv = (t: RawTask) => toTaskView(t, now, todayKey, tz, locale);
  const open = d.tasks.filter(isOpen);

  const overdue = open
    .filter((t) => isOverdue(t, now, todayKey, tz))
    .map(tv)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.priority - b.priority);

  const dueSoon = open
    .filter((t) => {
      const k = taskDueKey(t, tz);
      return k !== null && !isOverdue(t, now, todayKey, tz) && diffDays(todayKey, k) <= 3;
    })
    .map(tv)
    .sort((a, b) => (a.dueKey ?? "").localeCompare(b.dueKey ?? "") || a.priority - b.priority);

  const priorities = open
    .filter((t) => t.is_top_priority || (taskDueKey(t, tz) === todayKey && t.priority <= 2))
    .map(tv)
    .sort((a, b) => Number(b.is_top_priority) - Number(a.is_top_priority) || a.priority - b.priority)
    .slice(0, 5);

  const ev = (e: RawEvent): EventView => ({
    ...e,
    dateKey: eventDateKey(e, tz),
    timeLabel: e.all_day ? "All day" : `${formatTime(e.starts_at, tz, locale)} – ${formatTime(e.ends_at, tz, locale)}`,
  });
  const agenda = eventsOnDay(d.events, todayKey, tz).map(ev);
  const upcoming = d.events
    .filter((e) => {
      const k = eventDateKey(e, tz);
      return k > todayKey && diffDays(todayKey, k) <= 7;
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 6)
    .map(ev);

  const reminders = d.reminders
    .filter((r) => r.status === "scheduled" || r.status === "snoozed")
    .map((r) => {
      const at = r.snoozed_until ?? r.remind_at;
      return { id: r.id, title: r.title, at, timeLabel: formatTime(at, tz, locale), snoozed: r.status === "snoozed", source: r.source, key: localDateKey(new Date(at), tz) };
    })
    .filter((r) => r.key <= todayKey)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(({ key: _key, ...r }) => r);

  const habits = d.habits.filter((h) => !h.paused_at).map((h) => computeHabit(h, d.habitLogs, todayKey, tz));

  const goals = d.goals
    .filter((g) => g.status === "active" && g.level !== "vision")
    .map((g) => {
      const target = g.metric_target ? Number(g.metric_target) : null;
      const current = g.metric_current ? Number(g.metric_current) : null;
      const pct = target && current !== null ? Math.min(100, Math.round((current / target) * 100)) : null;
      return { ...g, pct };
    })
    .sort((a, b) => (a.target_date ?? "9999").localeCompare(b.target_date ?? "9999"))
    .slice(0, 5);

  const projects = d.projects
    .filter((p) => p.status === "active")
    .map((p) => {
      const pt = d.tasks.filter((t) => t.project_id === p.id && t.status !== "cancelled");
      const done = pt.filter((t) => t.status === "done").length;
      const openCount = pt.length - done;
      const pct = pt.length ? Math.round((done / pt.length) * 100) : null;
      let risk: "none" | "watch" | "late" = "none";
      if (p.due_date) {
        const days = diffDays(todayKey, p.due_date);
        if (days < 0 && openCount > 0) risk = "late";
        else if (days <= 7 && (pct ?? 0) < 70) risk = "watch";
      }
      const blocked = pt.filter((t) => t.status === "waiting").length;
      const overdue = pt.filter((t) => OPEN.includes(t.status) && ((t.due_date && t.due_date < todayKey) || (t.due_at && new Date(t.due_at) < now))).length;
      const nextMs = (d.milestones ?? [])
        .filter((m) => m.project_id === p.id && !m.completed_at && m.due_date)
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
      return {
        id: p.id, name: p.name, area: p.area, status: p.status, dueDate: p.due_date, open: openCount, done, pct, risk, blocked, overdue,
        nextMilestone: nextMs ? { title: nextMs.title, dueDate: nextMs.due_date! } : null, source: p.source,
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  const finance = computeFinance(d, todayKey);

  const wDays = d.wellness
    .filter((w) => diffDays(w.log_date, todayKey) < 7 && w.log_date <= todayKey)
    .sort((a, b) => a.log_date.localeCompare(b.log_date));
  const wellness = wDays.length
    ? { days: wDays.map((w) => ({ date: w.log_date, mood: w.mood, energy: w.energy })), source: dominantSource(wDays) }
    : null;

  const nights = d.sleep
    .filter((s) => diffDays(s.sleep_date, todayKey) < 7 && s.sleep_date <= todayKey)
    .sort((a, b) => a.sleep_date.localeCompare(b.sleep_date));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const sleep = nights.length
    ? {
        nights: nights.map((n) => ({ date: n.sleep_date, minutes: n.duration_minutes, quality: n.quality })),
        avgMinutes: nights.length >= 3 ? Math.round(avg(nights.map((n) => n.duration_minutes))!) : null,
        avgQuality: nights.filter((n) => n.quality).length >= 3 ? Math.round(avg(nights.flatMap((n) => (n.quality ? [n.quality] : [])))! * 10) / 10 : null,
        source: dominantSource(nights),
      }
    : null;

  const wheel = computeWheel(d);

  const stats = {
    openTasks: open.length,
    doneToday: d.tasks.filter((t) => t.completed_at && localDateKey(new Date(t.completed_at), tz) === todayKey).length,
    habitsDoneToday: habits.filter((h) => h.scheduledToday && h.doneToday).length,
    habitsScheduledToday: habits.filter((h) => h.scheduledToday).length,
  };

  const model: DashboardModel = {
    todayKey,
    priorities, agenda, upcoming, overdue, dueSoon, reminders, habits, goals, projects, finance, wellness, sleep, wheel,
    journal: [...d.journal].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).slice(0, 3),
    notes: [...d.notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3),
    changes: [],
    briefing: { lines: [], suggestedPriorities: [] },
    suggestions: [],
    eveningReview: d.reviews.find((r) => r.review_date === todayKey && r.kind === "evening") ?? null,
    stats,
  };

  model.changes = computeChanges(d, model, todayKey, yesterdayKey, tz, locale);
  model.briefing = computeBriefing(model, tz, locale);
  model.suggestions = computeSuggestions(model);
  return model;
}

function computeWheel(d: RawLifeData): WheelView | null {
  const sorted = [...d.wheelAssessments].sort((a, b) => b.assessed_on.localeCompare(a.assessed_on));
  const latest = sorted[0];
  if (!latest) return null;
  const prev = sorted[1] ?? null;
  const names = new Map(d.wheelCategories.map((c) => [c.id, c]));
  const ratings = latest.ratings
    .filter((r) => names.has(r.category_id))
    .map((r) => ({
      categoryId: r.category_id,
      name: names.get(r.category_id)!.name,
      score: r.score,
      desired: r.desired_score,
      previous: prev?.ratings.find((p) => p.category_id === r.category_id)?.score ?? null,
      order: names.get(r.category_id)!.sort_order,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ order: _o, ...r }) => r);
  const byScore = [...ratings].sort((a, b) => a.score - b.score);
  const lowScore = byScore[0]?.score;
  const highScore = byScore[byScore.length - 1]?.score;
  return {
    assessedOn: latest.assessed_on,
    previousOn: prev?.assessed_on ?? null,
    ratings,
    lowest: byScore.filter((r) => r.score === lowScore).slice(0, 2).map((r) => r.name),
    highest: byScore.filter((r) => r.score === highScore).slice(0, 2).map((r) => r.name),
    source: latest.source,
  };
}

function computeChanges(d: RawLifeData, m: DashboardModel, todayKey: string, yesterdayKey: string, tz: string, locale: string): ChangeItem[] {
  const out: ChangeItem[] = [];
  const completedYesterday = d.tasks.filter((t) => t.completed_at && localDateKey(new Date(t.completed_at), tz) === yesterdayKey).length;
  if (completedYesterday) out.push({ id: "done-y", tone: "positive", text: `You completed ${completedYesterday} task${completedYesterday > 1 ? "s" : ""} yesterday.` });

  const newlyOverdue = m.overdue.filter((t) => t.dueKey === yesterdayKey).length;
  if (newlyOverdue) out.push({ id: "overdue-new", tone: "attention", text: `${newlyOverdue} task${newlyOverdue > 1 ? "s" : ""} became overdue since yesterday.` });

  const spentY = totalsByCurrency(
    d.transactions.filter((t) => t.kind === "expense" && t.occurred_on === yesterdayKey).map((t) => ({ amount: t.amount.replace(/^-/, ""), currency: t.currency })),
  );
  if (spentY.length) out.push({ id: "spend-y", tone: "neutral", text: `Yesterday's recorded spending: ${spentY.map((s) => formatMoney(s, locale)).join(" + ")}.` });

  for (const b of m.finance?.budgets ?? []) {
    for (const l of b.lines) {
      if (l.status === "over") out.push({ id: `over-${b.id}-${l.categoryName}`, tone: "attention", text: `${l.categoryName} is over its monthly budget (${Math.round(l.pct)}%).` });
    }
  }

  const lastNight = d.sleep.find((s) => s.sleep_date === todayKey);
  if (lastNight) {
    const h = Math.floor(lastNight.duration_minutes / 60);
    const min = lastNight.duration_minutes % 60;
    out.push({ id: "sleep-last", tone: "neutral", text: `Last night's sleep log: ${h}h ${min}m${lastNight.quality ? `, quality ${lastNight.quality}/5` : ""}.` });
  }

  const reviewY = d.reviews.find((r) => r.review_date === yesterdayKey && r.kind === "evening");
  if (reviewY?.tomorrow_priorities.length) out.push({ id: "review-y", tone: "neutral", text: `Yesterday you planned: ${reviewY.tomorrow_priorities.slice(0, 3).join("; ")}.` });

  return out;
}

function computeBriefing(m: DashboardModel, tz: string, locale: string) {
  const lines: string[] = [];
  const timed = m.agenda.filter((e) => !e.all_day);
  if (m.agenda.length) {
    const first = timed[0];
    lines.push(
      `${m.agenda.length} event${m.agenda.length > 1 ? "s" : ""} today` +
        (first ? `, starting ${formatTime(first.starts_at, tz, locale)} with ${first.title}.` : "."),
    );
    const busyMin = timed.reduce((s, e) => s + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000, 0);
    if (busyMin >= 60) lines.push(`About ${Math.round(busyMin / 30) / 2} hours are already committed to scheduled events.`);
    const conflicts = findConflicts(m.agenda);
    if (conflicts.length) lines.push(`${conflicts.length} scheduling conflict${conflicts.length > 1 ? "s" : ""}: ${conflicts.map(([a, b]) => `${a.title} overlaps ${b.title}`).join("; ")}.`);
  } else {
    lines.push("No calendar events today.");
  }
  if (m.overdue.length) lines.push(`${m.overdue.length} overdue task${m.overdue.length > 1 ? "s" : ""} need a decision: do, reschedule, or drop.`);
  if (m.stats.habitsScheduledToday) lines.push(`${m.stats.habitsScheduledToday} habit${m.stats.habitsScheduledToday > 1 ? "s" : ""} scheduled today.`);

  // Realistic priorities: at most three, favouring explicit top priorities,
  // then urgent overdue work, then what is due today.
  const seen = new Set<string>();
  const pick: TaskView[] = [];
  for (const t of [...m.priorities.filter((p) => p.is_top_priority), ...m.overdue.filter((o) => o.priority <= 2), ...m.priorities, ...m.dueSoon.filter((s) => s.dueKey === m.todayKey)]) {
    if (pick.length >= 3) break;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    pick.push(t);
  }
  return { lines, suggestedPriorities: pick };
}

function computeSuggestions(m: DashboardModel): Suggestion[] {
  const out: Suggestion[] = [];
  const stale = m.overdue.filter((t) => t.daysOverdue >= 3);
  if (stale.length) {
    out.push({
      id: "stale-overdue",
      text: `Decide on ${stale.length} task${stale.length > 1 ? "s" : ""} overdue by 3+ days. Reschedule to a realistic date or let ${stale.length > 1 ? "them" : "it"} go.`,
      evidence: stale.slice(0, 3).map((t) => `“${t.title}” (${t.daysOverdue}d)`).join(", "),
      href: "/tasks",
    });
  }
  for (const b of m.finance?.budgets ?? []) {
    const watch = b.lines.filter((l) => l.status !== "ok");
    if (watch.length) {
      out.push({
        id: `budget-${b.id}`,
        text: `Spending in ${watch.map((l) => l.categoryName).join(" and ")} is running ahead of this month's pace.`,
        evidence: watch.map((l) => `${l.categoryName}: ${Math.round(l.pct)}% used vs ${b.pacePct}% of month elapsed`).join("; "),
        href: "/finance",
      });
    }
  }
  const struggling = m.habits.filter((h) => h.consistency30 !== null && h.scheduled30 >= 8 && h.consistency30 < 50);
  for (const h of struggling.slice(0, 1)) {
    out.push({
      id: `habit-${h.id}`,
      text: `“${h.name}” has been hard to keep. A smaller target or fewer scheduled days may make it sustainable.`,
      evidence: `${h.consistency30}% of ${h.scheduled30} scheduled days in the last 30`,
      href: "/habits",
    });
  }
  if (m.sleep?.avgMinutes && m.sleep.nights.length >= 5 && m.sleep.avgMinutes < 7 * 60) {
    const h = Math.floor(m.sleep.avgMinutes / 60);
    out.push({
      id: "sleep-short",
      text: "Your logged sleep is below the 7+ hours generally recommended for adults. An earlier, consistent bedtime is the usual first lever.",
      evidence: `Average ${h}h ${m.sleep.avgMinutes % 60}m over ${m.sleep.nights.length} logged nights`,
      href: "/health?tab=sleep",
    });
  }
  const atRisk = m.projects.filter((p) => p.risk !== "none");
  if (atRisk.length) {
    out.push({
      id: "projects-risk",
      text: `${atRisk.map((p) => p.name).join(", ")} ${atRisk.length > 1 ? "are" : "is"} at risk of missing ${atRisk.length > 1 ? "their" : "its"} deadline.`,
      evidence: atRisk.map((p) => `${p.name}: ${p.pct ?? 0}% of tasks done, due ${p.dueDate ? formatShortDate(p.dueDate) : "–"}`).join("; "),
      href: "/work",
    });
  }
  const blocked = m.projects.filter((p) => p.blocked > 0);
  if (blocked.length) {
    const n = blocked.reduce((a, p) => a + p.blocked, 0);
    out.push({
      id: "projects-blocked",
      text: `${n} project task${n > 1 ? "s are" : " is"} blocked. Clearing what ${n > 1 ? "they wait" : "it waits"} on may unlock more than starting something new.`,
      evidence: blocked.map((p) => `${p.name}: ${p.blocked} blocked`).join("; "),
      href: "/work?tab=board",
    });
  }
  return out.slice(0, 5);
}
