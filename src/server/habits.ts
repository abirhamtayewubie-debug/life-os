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
      habits: s.habits.map((h) => ({ ...h, goal_id: h.goal_id ?? null, description: null, archived_at: null, scheduled_time: null, reminder: null })) as HabitRecord[],
      goals: s.goals.map(({ id, title }) => ({ id, title })),
      logs: s.habit_logs.map(({ habit_id, log_date, count }) => ({ habit_id, log_date, count })),
      logsFrom, today, timezone, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [habits, logs, goals, reminders] = await Promise.all([
    supabase.from("habits").select("id, name, description, cadence, schedule_days, target_per_period, time_of_day, scheduled_time, paused_at, archived_at, created_at, goal_id, source").order("created_at"),
    supabase.from("habit_logs").select("habit_id, log_date, count").gte("log_date", logsFrom).limit(20000),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("reminders").select("habit_id, channels, remind_at").not("habit_id", "is", null).in("status", ["scheduled", "snoozed"]),
  ]);
  for (const r of [habits, logs, goals, reminders]) if (r.error) throw new Error(`Could not load habits: ${r.error.message}`);
  const reminderOf = new Map((reminders.data ?? []).map((r) => [r.habit_id as string, { channels: r.channels as string[], next: r.remind_at as string }]));
  return { habits: (habits.data ?? []).map((h) => ({ ...h, reminder: reminderOf.get(h.id) ?? null })) as HabitRecord[], goals: goals.data ?? [], logs: logs.data ?? [], logsFrom, today, timezone, locale, demo: false };
}
