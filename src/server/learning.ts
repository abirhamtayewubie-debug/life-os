import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LearningItem, LearningWorkspace, Skill } from "@/features/learning/types";
import { getViewer } from "./viewer";

export async function getLearningWorkspace(now = new Date()): Promise<LearningWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return { items: s.learning_items as LearningItem[], skills: s.skills as Skill[], goals: s.goals.map(({ id, title }) => ({ id, title })), today, locale, demo: true };
  }

  const supabase = await createSupabaseServerClient();
  const [items, skills, goals] = await Promise.all([
    supabase.from("learning_items").select("id, goal_id, kind, title, author, url, status, progress_pct, started_on, finished_on, notes, source").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("skills").select("id, name, area, level, target_level, notes, source").order("name"),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
  ]);
  for (const r of [items, skills, goals]) if (r.error) throw new Error(`Could not load learning: ${r.error.message}`);
  return { items: (items.data ?? []) as LearningItem[], skills: (skills.data ?? []) as Skill[], goals: goals.data ?? [], today, locale, demo: false };
}
