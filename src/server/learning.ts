import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEARNING_ITEM_COLUMNS, SESSION_HISTORY_DAYS, STUDY_SESSION_COLUMNS, type LearningItem, type LearningWorkspace, type Roadmap, type Skill, type StudySession } from "@/features/learning/types";
import { getViewer } from "./viewer";

export async function getLearningWorkspace(now = new Date()): Promise<LearningWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);
  const since = addDays(today, -SESSION_HISTORY_DAYS + 1);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return {
      items: s.demo_learning_items as LearningItem[], skills: s.skills as Skill[],
      roadmaps: s.learning_roadmaps.map((r) => ({ ...r, steps: s.learning_steps.filter((x) => x.roadmap_id === r.id), reminder: null })) as Roadmap[],
      sessions: [...s.demo_study_sessions].sort((a, b) => b.studied_on.localeCompare(a.studied_on)) as StudySession[],
      goals: s.goals.map(({ id, title }) => ({ id, title })), today, timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [items, skills, goals, roadmaps, sessions, reminders] = await Promise.all([
    supabase.from("learning_items").select(LEARNING_ITEM_COLUMNS).order("updated_at", { ascending: false }).limit(1000),
    supabase.from("skills").select("id, name, area, level, target_level, notes, source").order("name"),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("learning_roadmaps")
      .select("id, title, description, goal_id, skill_id, target_date, study_days, study_time, study_minutes, archived_at, source, learning_steps(id, position, title, is_exercise, learning_item_id, notes, done_at)")
      .order("created_at").limit(200),
    supabase.from("study_sessions").select(STUDY_SESSION_COLUMNS).gte("studied_on", since).order("studied_on", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
    supabase.from("reminders").select("id, roadmap_id, remind_at, channels").not("roadmap_id", "is", null).in("status", ["scheduled", "snoozed"]),
  ]);
  for (const r of [items, skills, goals, roadmaps, sessions, reminders]) if (r.error) throw new Error(`Could not load learning: ${r.error.message}`);
  const reminderFor = new Map((reminders.data ?? []).map((r) => [r.roadmap_id, { id: r.id, remind_at: r.remind_at, channels: r.channels as string[] }]));
  return {
    items: (items.data ?? []) as LearningItem[],
    skills: (skills.data ?? []) as Skill[],
    roadmaps: (roadmaps.data ?? []).map(({ learning_steps, ...r }) => ({
      ...r, steps: [...(learning_steps ?? [])].sort((a, b) => a.position - b.position), reminder: reminderFor.get(r.id) ?? null,
    })) as Roadmap[],
    sessions: (sessions.data ?? []) as StudySession[],
    goals: goals.data ?? [],
    today, timezone, locale, demo: false,
  };
}
