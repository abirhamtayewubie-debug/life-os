import { addDays, diffDays, localDateKey, weekdayOf } from "@/lib/dates";
import type { MilestoneRecord } from "@/features/goals/types";
import type { ProjectRecord, ProjectTask, TimeEntry } from "./types";

/** Minutes of an entry; a running timer counts up to `now`. */
export function entryMinutes(e: Pick<TimeEntry, "started_at" | "ended_at">, now: Date): number {
  const end = e.ended_at ? new Date(e.ended_at) : now;
  return Math.max(0, Math.round((end.getTime() - new Date(e.started_at).getTime()) / 60000));
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Monday of the week containing `dayKey`. */
export const weekStart = (dayKey: string) => addDays(dayKey, -((weekdayOf(dayKey) + 6) % 7));

/** Minutes per project for the week containing `todayKey` (entries attributed to their local start day). */
export function weekTotals(entries: TimeEntry[], todayKey: string, tz: string, now: Date): Map<string | null, number> {
  const from = weekStart(todayKey);
  const to = addDays(from, 6);
  const m = new Map<string | null, number>();
  for (const e of entries) {
    const k = localDateKey(new Date(e.started_at), tz);
    if (k < from || k > to) continue;
    m.set(e.project_id, (m.get(e.project_id) ?? 0) + entryMinutes(e, now));
  }
  return m;
}

export function projectProgress(p: Pick<ProjectRecord, "id">, tasks: ProjectTask[]): { done: number; total: number; pct: number | null } {
  const mine = tasks.filter((t) => t.project_id === p.id && !t.parent_task_id && t.status !== "cancelled");
  const done = mine.filter((t) => t.status === "done").length;
  return { done, total: mine.length, pct: mine.length ? Math.round((done / mine.length) * 100) : null };
}

/**
 * Timeline window: from the earliest start (or today) to the latest due date,
 * padded, at least 8 weeks. Returns position helpers in percent.
 */
export function timelineWindow(projects: Pick<ProjectRecord, "start_date" | "due_date">[], todayKey: string) {
  const dates = projects.flatMap((p) => [p.start_date, p.due_date]).filter((d): d is string => !!d);
  let from = [todayKey, ...dates].sort()[0];
  let to = [todayKey, ...dates].sort().at(-1)!;
  from = addDays(weekStart(from), -7);
  to = addDays(to, 14);
  if (diffDays(from, to) < 56) to = addDays(from, 56);
  const span = diffDays(from, to);
  const pos = (k: string) => Math.max(0, Math.min(100, (diffDays(from, k) / span) * 100));
  return { from, to, span, pos };
}

/** Top-level tasks per board column for one project, or all projects when `projectId` is null. */
export function statusCounts(tasks: ProjectTask[], projectId: string | null): Record<ProjectTask["status"], number> {
  const c = { todo: 0, in_progress: 0, waiting: 0, done: 0, cancelled: 0 };
  for (const t of tasks) if (!t.parent_task_id && (projectId === null || t.project_id === projectId)) c[t.status]++;
  return c;
}

/** Done and total subtasks per parent task. */
export function subtaskCounts(tasks: ProjectTask[]): Map<string, { done: number; total: number }> {
  const m = new Map<string, { done: number; total: number }>();
  for (const t of tasks) {
    if (!t.parent_task_id || t.status === "cancelled") continue;
    const c = m.get(t.parent_task_id) ?? { done: 0, total: 0 };
    c.total++;
    if (t.status === "done") c.done++;
    m.set(t.parent_task_id, c);
  }
  return m;
}

/** Local due day of a task: its all-day date, or the day its due instant falls on. */
export const taskDueKey = (t: Pick<ProjectTask, "due_date" | "due_at">, tz: string) => t.due_date ?? (t.due_at ? localDateKey(new Date(t.due_at), tz) : null);

export type Deadline = {
  key: string;
  date: string;
  kind: "task" | "milestone" | "start" | "due";
  title: string;
  projectId: string;
  /** Task id for task deadlines. */
  taskId?: string;
  done: boolean;
  priority?: number;
};

/**
 * Everything dated in the projects between `from` and `to` (inclusive):
 * task due dates, milestones, project starts and due dates. Subtasks and
 * cancelled work are left out so a day isn't counted twice.
 */
export function projectDeadlines(
  ws: { projects: ProjectRecord[]; tasks: ProjectTask[]; milestones: MilestoneRecord[] },
  from: string, to: string, tz: string, projectId: string | null,
): Deadline[] {
  const inRange = (k: string | null): k is string => !!k && k >= from && k <= to;
  const wanted = (pid: string | null): pid is string => !!pid && (projectId === null || pid === projectId);
  const out: Deadline[] = [];
  for (const p of ws.projects) {
    if (!wanted(p.id) || p.status === "cancelled") continue;
    if (inRange(p.start_date)) out.push({ key: `s-${p.id}`, date: p.start_date, kind: "start", title: `${p.name} starts`, projectId: p.id, done: false });
    if (inRange(p.due_date)) out.push({ key: `d-${p.id}`, date: p.due_date, kind: "due", title: `${p.name} due`, projectId: p.id, done: p.status === "completed" });
  }
  for (const m of ws.milestones) {
    if (wanted(m.project_id) && inRange(m.due_date)) out.push({ key: `m-${m.id}`, date: m.due_date, kind: "milestone", title: m.title, projectId: m.project_id, done: !!m.completed_at });
  }
  for (const t of ws.tasks) {
    const k = taskDueKey(t, tz);
    if (t.parent_task_id || t.status === "cancelled" || !wanted(t.project_id) || !inRange(k)) continue;
    out.push({ key: `t-${t.id}`, date: k, kind: "task", title: t.title, projectId: t.project_id, taskId: t.id, done: t.status === "done", priority: t.priority });
  }
  const order = { due: 0, milestone: 1, start: 2, task: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || (a.priority ?? 9) - (b.priority ?? 9) || a.title.localeCompare(b.title));
}

/** Board order inside a column: urgent first, then the nearest deadline, then oldest. Done shows the latest first. */
export function boardOrder(a: ProjectTask, b: ProjectTask, tz: string): number {
  if (a.status === "done" && b.status === "done") return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
  return a.priority - b.priority || (taskDueKey(a, tz) ?? "9999").localeCompare(taskDueKey(b, tz) ?? "9999") || a.created_at.localeCompare(b.created_at);
}
