import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MilestoneRecord } from "@/features/goals/types";
import type { ProjectRecord, ProjectTask, TimeEntry, WorkWorkspace } from "@/features/work/types";
import { getViewer } from "./viewer";

const CURRENCIES = ["ETB", "USD", "CAD", "EUR", "GBP", "KES", "AED"];

export async function getWorkWorkspace(now = new Date()): Promise<WorkWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale, baseCurrency } = viewer.profile;
  const today = localDateKey(now, timezone);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, baseCurrency);
    return {
      projects: s.projects.map((p) => ({ ...p, description: null, start_date: null, budget_amount: null, budget_currency: null })) as ProjectRecord[],
      tasks: s.tasks.filter((t) => t.project_id).map((t) => ({ ...t, parent_task_id: null })) as ProjectTask[],
      milestones: s.milestones.filter((m) => m.project_id) as MilestoneRecord[],
      time: s.time_entries as TimeEntry[],
      goals: s.goals.map((g) => ({ id: g.id, title: g.title })),
      currencies: CURRENCIES, baseCurrency, today, timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const [projects, tasks, milestones, time, goals, currencies] = await Promise.all([
    supabase.from("projects").select("id, goal_id, name, description, status, area, start_date, due_date, budget_amount::text, budget_currency, source").is("archived_at", null).order("created_at"),
    supabase.from("tasks").select("id, title, status, priority, project_id, due_date, due_at, parent_task_id, source").is("archived_at", null).not("project_id", "is", null)
      .or(`status.neq.done,completed_at.gte.${addDays(today, -90)}`).limit(3000),
    supabase.from("milestones").select("id, project_id, goal_id, title, due_date, completed_at, sort_order, source").not("project_id", "is", null).order("sort_order"),
    supabase.from("time_entries").select("id, project_id, task_id, started_at, ended_at, note, source").or(`started_at.gte.${since},ended_at.is.null`).order("started_at", { ascending: false }).limit(2000),
    supabase.from("goals").select("id, title").is("archived_at", null).in("status", ["active", "paused"]).order("created_at"),
    supabase.from("currencies").select("code").order("code"),
  ]);
  for (const r of [projects, tasks, milestones, time, goals, currencies]) if (r.error) throw new Error(`Could not load projects: ${r.error.message}`);
  return {
    projects: (projects.data ?? []) as unknown as ProjectRecord[],
    tasks: (tasks.data ?? []) as ProjectTask[],
    milestones: (milestones.data ?? []) as MilestoneRecord[],
    time: (time.data ?? []) as TimeEntry[],
    goals: goals.data ?? [],
    currencies: (currencies.data ?? []).map((c) => c.code.trim()),
    baseCurrency, today, timezone, locale, demo: false,
  };
}
