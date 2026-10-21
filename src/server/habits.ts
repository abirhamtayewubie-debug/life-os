import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HabitRecord, HabitWorkspace } from "@/features/habits/types";
import { getViewer } from "./viewer";

/** Habits (active, paused and archived) plus ~4 months of logs. */
export async function getHabitWorkspace(now = new Date()): Promise<HabitWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);
  const logsFrom = addDays(today, -120);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    return {
      habits: s.habits.map((h) => ({ ...h, description: null, archived_at: null })) as HabitRecord[],
      logs: s.habit_logs.map(({ habit_id, log_date, count }) => ({ habit_id, log_date, count })),
      logsFrom, today, timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [habits, logs] = await Promise.all([
    supabase.from("habits").select("id, name, description, cadence, schedule_days, target_per_period, time_of_day, paused_at, archived_at, created_at, source").order("created_at"),
    supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", logsFrom).limit(20000),
  ]);
  for (const r of [habits, logs]) if (r.error) throw new Error(`Could not load habits: ${r.error.message}`);
  return { habits: (habits.data ?? []) as HabitRecord[], logs: logs.data ?? [], logsFrom, today, timezone, locale, demo: false };
}
