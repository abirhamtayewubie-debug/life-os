import { addDays, diffDays, localDateKey, weekdayOf } from "@/lib/dates";
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
