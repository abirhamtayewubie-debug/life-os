import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WheelAssessment, WheelCategory, WheelWorkspace } from "@/features/wheel/types";
import { getViewer } from "./viewer";

export async function getWheelWorkspace(now = new Date()): Promise<WheelWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return {
      categories: s.wheel_categories.map((c) => ({ ...c, description: null, archived_at: null })) as WheelCategory[],
      assessments: [...s.wheel_assessments].reverse().map((a) => ({
        ...a, ratings: s.wheel_ratings.filter((r) => r.assessment_id === a.id).map((r) => ({ category_id: r.category_id, score: r.score, desired_score: r.desired_score, note: null })),
      })) as WheelAssessment[],
      goals: s.goals.map((g) => ({ id: g.id, title: g.title, wheel_category_id: g.wheel_category_id, status: g.status })),
      today, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [cats, assess, goals] = await Promise.all([
    supabase.from("wheel_categories").select("id, name, description, sort_order, archived_at, source").order("sort_order"),
    supabase.from("wheel_assessments").select("id, assessed_on, note, source, wheel_ratings(category_id, score, desired_score, note)").order("assessed_on", { ascending: false }).limit(60),
    supabase.from("goals").select("id, title, wheel_category_id, status").is("archived_at", null).not("wheel_category_id", "is", null),
  ]);
  for (const r of [cats, assess, goals]) if (r.error) throw new Error(`Could not load the Wheel of Life: ${r.error.message}`);
  return {
    categories: (cats.data ?? []) as WheelCategory[],
    assessments: (assess.data ?? []).map(({ wheel_ratings, ...a }) => ({ ...a, ratings: wheel_ratings })) as WheelAssessment[],
    goals: goals.data ?? [],
    today, locale, demo: false,
  };
}
