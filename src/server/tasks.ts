import "server-only";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReminderRecord, TaskRecord, TaskWorkspace } from "@/features/tasks/types";
import { getViewer } from "./viewer";

export const TASK_COLUMNS =
  "id, title, notes, status, priority, area, due_date, due_at, is_top_priority, completed_at, project_id, goal_id, parent_task_id, recurrence_rule, recurrence_tz, estimate_minutes, series_id, created_at, updated_at, source, task_tags(tag:tags(id, name))";

type TaskRow = Omit<TaskRecord, "tags" | "dependsOn"> & { task_tags: { tag: { id: string; name: string } | null }[] };

export function mapTaskRow(r: TaskRow, deps: Map<string, string[]>): TaskRecord {
  const { task_tags, ...rest } = r;
  return { ...rest, tags: task_tags.flatMap((tt) => (tt.tag ? [tt.tag] : [])), dependsOn: deps.get(r.id) ?? [] };
}

/**
 * Everything the Tasks screen needs: open tasks, recently completed ones
 * (90 days), reminders, projects, tags and saved views. A personal task list
 * is small enough to filter in memory, which keeps filters instant.
 */
export async function getTaskWorkspace(now = new Date()): Promise<TaskWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return {
      tasks: s.tasks.map((t) => ({
        ...t, notes: null, parent_task_id: null, recurrence_rule: null, recurrence_tz: null, estimate_minutes: null, series_id: null,
        updated_at: t.created_at, tags: [], dependsOn: [],
      })) as TaskRecord[],
      reminders: s.reminders.map((r) => ({ ...r, task_id: null, event_id: null })) as ReminderRecord[],
      projects: s.projects.map((p) => ({ id: p.id, name: p.name })),
      goals: s.goals.map((g) => ({ id: g.id, title: g.title })),
      tags: [],
      savedViews: [],
      timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [open, done, deps, reminders, projects, goals, tags, views] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]).limit(3000),
    supabase.from("tasks").select(TASK_COLUMNS).is("archived_at", null).eq("status", "done").gte("completed_at", since).order("completed_at", { ascending: false }).limit(500),
    supabase.from("task_dependencies").select("task_id, depends_on_task_id"),
    supabase.from("reminders").select("id, title, remind_at, timezone, status, snoozed_until, task_id, event_id, source").in("status", ["scheduled", "snoozed"]).order("remind_at").limit(500),
    supabase.from("projects").select("id, name").is("archived_at", null).in("status", ["planned", "active", "on_hold"]).order("name"),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("saved_views").select("id, name, filters").eq("module_key", "tasks").order("sort_order"),
  ]);
  for (const r of [open, done, deps, reminders, projects, goals, tags, views]) if (r.error) throw new Error(`Could not load tasks: ${r.error.message}`);

  const depMap = new Map<string, string[]>();
  for (const d of deps.data ?? []) depMap.set(d.task_id, [...(depMap.get(d.task_id) ?? []), d.depends_on_task_id]);

  return {
    tasks: [...(open.data as unknown as TaskRow[]), ...(done.data as unknown as TaskRow[])].map((r) => mapTaskRow(r, depMap)),
    reminders: (reminders.data ?? []) as ReminderRecord[],
    projects: projects.data ?? [],
    goals: goals.data ?? [],
    tags: tags.data ?? [],
    savedViews: (views.data ?? []) as TaskWorkspace["savedViews"],
    timezone, locale, demo: false,
  };
}
