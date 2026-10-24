import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, localDateKey } from "@/lib/dates";
import { habitTargetMet, nextHabitReminder } from "@/lib/habit-reminder";

export type DueReminder = {
  id: string;
  remind_at: string;
  snoozed_until: string | null;
  timezone: string;
  recurrence_rule: string | null;
  habit_id?: string | null;
  channels?: string[];
};

/** A habit reminder found more than this late was missed; showing it now would only confuse. */
const STALE_MS = 2 * 3600_000;

/**
 * For due habit reminders: decide which should stay quiet (the target is
 * already met, the habit is paused or archived, or the moment passed long
 * ago), then move every one of them to its next occurrence so it repeats
 * without anyone tapping "done". The move is conditional on the old time,
 * so the cron sender and an open tab can both run this safely.
 * Returns the ids to leave unsent. Works with either the service client or
 * a user's RLS-scoped client.
 *
 * `advance` limits which reminders this caller may move on. The in-app check
 * must leave device reminders where they are, or the cron sender would find
 * nothing due and the push would never go out.
 */
export async function settleHabitReminders(db: SupabaseClient, due: DueReminder[], now: Date, advance: (r: DueReminder) => boolean = () => true): Promise<Set<string>> {
  const quiet = new Set<string>();
  const list = due.filter((r) => r.habit_id && r.recurrence_rule);
  if (!list.length) return quiet;
  const habitIds = [...new Set(list.map((r) => r.habit_id!))];
  const oldest = list.reduce((m, r) => Math.min(m, new Date(r.snoozed_until ?? r.remind_at).getTime()), now.getTime());
  const [habits, logs] = await Promise.all([
    db.from("habits").select("id, cadence, schedule_days, target_per_period, scheduled_time, paused_at, archived_at").in("id", habitIds),
    db.from("habit_logs").select("habit_id, log_date, count").in("habit_id", habitIds).gte("log_date", addDays(localDateKey(new Date(oldest), "UTC"), -8)),
  ]);
  if (habits.error || logs.error) return new Set(list.map((r) => r.id));
  const byId = new Map((habits.data ?? []).map((h) => [h.id, h]));

  for (const r of list) {
    const h = byId.get(r.habit_id!);
    const at = new Date(r.snoozed_until ?? r.remind_at);
    const day = localDateKey(at, r.timezone);
    const mine = (logs.data ?? []).filter((l) => l.habit_id === r.habit_id);
    if (!h || h.paused_at || h.archived_at || now.getTime() - at.getTime() > STALE_MS || habitTargetMet(h, mine, day)) quiet.add(r.id);
    if (!h?.scheduled_time || !advance(r)) continue;
    const next = nextHabitReminder(r.recurrence_rule!, h.scheduled_time, r.timezone, new Date(Math.max(now.getTime(), at.getTime())));
    if (next) {
      await db.from("reminders").update({ remind_at: next.toISOString(), snoozed_until: null, status: "scheduled" }).eq("id", r.id).eq("remind_at", r.remind_at);
    }
  }
  return quiet;
}
