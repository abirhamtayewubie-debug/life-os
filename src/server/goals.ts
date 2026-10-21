import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GoalLinks, GoalRecord, GoalWorkspace, MilestoneRecord, ProgressEntry } from "@/features/goals/types";
import { getViewer } from "./viewer";

const GOAL_COLUMNS = "id, parent_id, wheel_category_id, level, title, description, why, status, target_date, metric_label, metric_target::text, metric_current::text, completed_at, source";

function countBy(rows: { goal_id: string | null }[]) {
  const m = new Map<string, number>();
  for (const r of rows) if (r.goal_id) m.set(r.goal_id, (m.get(r.goal_id) ?? 0) + 1);
  return m;
}

export async function getGoalWorkspace(now = new Date()): Promise<GoalWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);

  const linksFor = (ids: string[], projects: { goal_id: string | null }[], tasks: { goal_id: string | null }[], habits: { goal_id: string | null }[], learning: { goal_id: string | null }[]) => {
    const [p, t, h, l] = [countBy(projects), countBy(tasks), countBy(habits), countBy(learning)];
    return Object.fromEntries(ids.map((id): [string, GoalLinks] => [id, { projects: p.get(id) ?? 0, openTasks: t.get(id) ?? 0, habits: h.get(id) ?? 0, learning: l.get(id) ?? 0 }]));
  };

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    const goals = s.goals.map((g) => ({ ...g, description: null, why: null, completed_at: null })) as GoalRecord[];
    return {
      goals,
      milestones: s.milestones.filter((m) => m.goal_id) as MilestoneRecord[],
      progress: [],
      links: linksFor(goals.map((g) => g.id), s.projects, s.tasks.filter((t) => t.status !== "done"), s.habits, s.learning_items),
      categories: s.wheel_categories.map((c) => ({ id: c.id, name: c.name })),
      today, timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [goals, milestones, progress, projects, tasks, habits, learning, cats] = await Promise.all([
    supabase.from("goals").select(GOAL_COLUMNS).is("archived_at", null).order("created_at"),
    supabase.from("milestones").select("id, project_id, goal_id, title, due_date, completed_at, sort_order, source").not("goal_id", "is", null).order("sort_order"),
    supabase.from("goal_progress_entries").select("id, goal_id, value::text, note, recorded_at, source").order("recorded_at", { ascending: false }).limit(500),
    supabase.from("projects").select("goal_id").is("archived_at", null).not("goal_id", "is", null),
    supabase.from("tasks").select("goal_id").is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]).not("goal_id", "is", null),
    supabase.from("habits").select("goal_id").is("archived_at", null).not("goal_id", "is", null),
    supabase.from("learning_items").select("goal_id").not("goal_id", "is", null),
    supabase.from("wheel_categories").select("id, name").is("archived_at", null).order("sort_order"),
  ]);
  for (const r of [goals, milestones, progress, projects, tasks, habits, learning, cats]) if (r.error) throw new Error(`Could not load goals: ${r.error.message}`);
  const g = (goals.data ?? []) as unknown as GoalRecord[];
  return {
    goals: g,
    milestones: (milestones.data ?? []) as MilestoneRecord[],
    progress: (progress.data ?? []) as unknown as ProgressEntry[],
    links: linksFor(g.map((x) => x.id), projects.data ?? [], tasks.data ?? [], habits.data ?? [], learning.data ?? []),
    categories: cats.data ?? [],
    today, timezone, locale, demo: false,
  };
}
