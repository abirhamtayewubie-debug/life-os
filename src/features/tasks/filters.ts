import { addDays, diffDays, localDateKey } from "@/lib/dates";
import type { Priority, TaskFilters, TaskRecord, TaskView } from "./types";

export const OPEN_STATUSES = ["todo", "in_progress", "waiting"] as const;
export const isOpenTask = (t: Pick<TaskRecord, "status">) => (OPEN_STATUSES as readonly string[]).includes(t.status);

export function dueKeyOf(t: Pick<TaskRecord, "due_date" | "due_at">, tz: string): string | null {
  if (t.due_date) return t.due_date;
  if (t.due_at) return localDateKey(new Date(t.due_at), tz);
  return null;
}

export function isTaskOverdue(t: TaskRecord, now: Date, tz: string): boolean {
  if (!isOpenTask(t)) return false;
  if (t.due_at) return new Date(t.due_at) < now;
  const k = dueKeyOf(t, tz);
  return k !== null && k < localDateKey(now, tz);
}

/** Open tasks this one waits on. */
export function blockersOf(t: TaskRecord, byId: Map<string, TaskRecord>): TaskRecord[] {
  return t.dependsOn.map((id) => byId.get(id)).filter((x): x is TaskRecord => !!x && isOpenTask(x));
}

const VIEWS: TaskView[] = ["today", "upcoming", "overdue", "nodate", "all", "done"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): TaskFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const view = VIEWS.includes(one("view") as TaskView) ? (one("view") as TaskView) : "today";
  const p = Number(one("priority"));
  return {
    view,
    q: one("q")?.slice(0, 100) || undefined,
    priority: [1, 2, 3, 4].includes(p) ? (p as Priority) : undefined,
    area: one("area") || undefined,
    tag: one("tag") || undefined,
    project: one("project") || undefined,
  };
}

export function filtersToSearch(f: TaskFilters): string {
  const sp = new URLSearchParams();
  sp.set("view", f.view);
  if (f.q) sp.set("q", f.q);
  if (f.priority) sp.set("priority", String(f.priority));
  if (f.area) sp.set("area", f.area);
  if (f.tag) sp.set("tag", f.tag);
  if (f.project) sp.set("project", f.project);
  return sp.toString();
}

/** Top-level tasks matching the filters. Subtasks are shown under their parent. */
export function applyFilters(tasks: TaskRecord[], f: TaskFilters, now: Date, tz: string): TaskRecord[] {
  const today = localDateKey(now, tz);
  const q = f.q?.toLowerCase();
  return tasks.filter((t) => {
    if (t.parent_task_id && !q) return false;
    if (f.view === "done" ? t.status !== "done" : !isOpenTask(t)) return false;
    const k = dueKeyOf(t, tz);
    switch (f.view) {
      case "today":
        if (!(t.is_top_priority || (k !== null && k <= today))) return false;
        break;
      case "upcoming":
        if (!(k !== null && k > today && diffDays(today, k) <= 14)) return false;
        break;
      case "overdue":
        if (!isTaskOverdue(t, now, tz)) return false;
        break;
      case "nodate":
        if (k !== null) return false;
        break;
    }
    if (q && !(t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q))) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.area && t.area !== f.area) return false;
    if (f.tag && !t.tags.some((g) => g.id === f.tag)) return false;
    if (f.project && t.project_id !== f.project) return false;
    return true;
  });
}

export type TaskGroup = { key: string; label: string; tasks: TaskRecord[] };

export function groupTasks(tasks: TaskRecord[], view: TaskView, now: Date, tz: string): TaskGroup[] {
  const today = localDateKey(now, tz);
  if (view === "done") {
    return [{ key: "done", label: "Completed", tasks: [...tasks].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")) }];
  }
  const buckets: Record<string, TaskGroup> = {
    overdue: { key: "overdue", label: "Overdue", tasks: [] },
    today: { key: "today", label: "Today", tasks: [] },
    tomorrow: { key: "tomorrow", label: "Tomorrow", tasks: [] },
    week: { key: "week", label: "Next 7 days", tasks: [] },
    later: { key: "later", label: "Later", tasks: [] },
    nodate: { key: "nodate", label: "No date", tasks: [] },
  };
  for (const t of tasks) {
    const k = dueKeyOf(t, tz);
    if (isTaskOverdue(t, now, tz)) buckets.overdue.tasks.push(t);
    else if (k === null) (t.is_top_priority ? buckets.today : buckets.nodate).tasks.push(t);
    else if (k === today) buckets.today.tasks.push(t);
    else if (k === addDays(today, 1)) buckets.tomorrow.tasks.push(t);
    else if (diffDays(today, k) <= 7) buckets.week.tasks.push(t);
    else buckets.later.tasks.push(t);
  }
  const sort = (a: TaskRecord, b: TaskRecord) =>
    Number(b.is_top_priority) - Number(a.is_top_priority) ||
    (dueKeyOf(a, tz) ?? "9999").localeCompare(dueKeyOf(b, tz) ?? "9999") ||
    (a.due_at ?? "").localeCompare(b.due_at ?? "") ||
    a.priority - b.priority ||
    a.created_at.localeCompare(b.created_at);
  return Object.values(buckets).filter((g) => g.tasks.length).map((g) => ({ ...g, tasks: g.tasks.sort(sort) }));
}

export function viewCounts(tasks: TaskRecord[], now: Date, tz: string): Record<TaskView, number> {
  const out = {} as Record<TaskView, number>;
  for (const v of VIEWS) out[v] = v === "done" || v === "all" ? 0 : applyFilters(tasks, { view: v }, now, tz).length;
  out.all = tasks.filter((t) => !t.parent_task_id && isOpenTask(t)).length;
  return out;
}
