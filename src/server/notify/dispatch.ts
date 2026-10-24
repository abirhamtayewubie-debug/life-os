import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RETRY_MINUTES } from "@/features/notifications/endpoints";
import { settleRepeatingReminders } from "./habit-reminders";
import { sendPush, type PushPayload } from "./push";

/** Channels the server sends itself; in-app alerts are shown by the open tab. */
const OUTSIDE = ["web_push", "email"] as const;
type Outside = (typeof OUTSIDE)[number];

export type SendOutcome = { status: "sent" } | { status: "skipped"; error: string } | { status: "retry"; error: string };
export type Senders = {
  web_push: (db: SupabaseClient, userId: string, payload: PushPayload) => Promise<SendOutcome>;
  email: (db: SupabaseClient, userId: string, payload: PushPayload) => Promise<SendOutcome>;
};

export type DispatchSummary = { queued: number; sent: number; skipped: number; retrying: number; failed: number };

/** Sends to every device the person turned notifications on for; drops devices that have gone away. */
export async function pushToDevices(db: SupabaseClient, userId: string, payload: PushPayload): Promise<SendOutcome> {
  const { data: subs, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  if (error) return { status: "retry", error: "Couldn't read devices." };
  if (!subs?.length) return { status: "skipped", error: "No device has notifications turned on." };
  let delivered = 0;
  let lastError = "";
  for (const s of subs) {
    const r = await sendPush(s, payload);
    if (r.ok) {
      delivered++;
      await db.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } else if (r.gone) {
      await db.from("push_subscriptions").delete().eq("id", s.id);
      lastError = r.error;
    } else {
      lastError = r.error;
      await db.from("push_subscriptions").update({ failure_count: Math.min(s.failure_count + 1, 1000) }).eq("id", s.id);
    }
  }
  if (delivered) return { status: "sent" };
  return subs.length && lastError === "This device turned notifications off." ? { status: "skipped", error: lastError } : { status: "retry", error: lastError || "Not delivered." };
}

const DEFAULT_SENDERS: Senders = {
  web_push: pushToDevices,
  email: async () => ({ status: "skipped", error: "Email reminders aren't set up yet." }),
};

function linkFor(r: { task_id: string | null; event_id: string | null; habit_id?: string | null; roadmap_id?: string | null }) {
  return r.task_id ? `/tasks?open=${r.task_id}` : r.event_id ? "/calendar" : r.habit_id ? "/habits" : r.roadmap_id ? "/learning?tab=roadmaps" : "/tasks";
}

/**
 * One pass of the reminder sender. Safe to run often and in parallel:
 * deliveries are unique per (reminder, channel, time) and each attempt is
 * claimed with a conditional update before anything is sent.
 */
export async function dispatchDue(db: SupabaseClient, now = new Date(), senders: Senders = DEFAULT_SENDERS): Promise<DispatchSummary> {
  const summary: DispatchSummary = { queued: 0, sent: 0, skipped: 0, retrying: 0, failed: 0 };
  const nowIso = now.toISOString();
  // Don't send anything more than a day late; those were missed, not due.
  const oldest = now.getTime() - 24 * 3600_000;

  const { data: due, error } = await db
    .from("reminders")
    .select("id, user_id, remind_at, snoozed_until, channels, timezone, recurrence_rule, habit_id, roadmap_id")
    .in("status", ["scheduled", "snoozed"])
    .overlaps("channels", [...OUTSIDE])
    .lte("remind_at", nowIso)
    .order("remind_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Couldn't read due reminders: ${error.message}`);

  // Habit and study reminders repeat on their own; ones already done that day stay quiet.
  const quiet = await settleRepeatingReminders(db, (due ?? []).filter((r) => new Date(r.snoozed_until ?? r.remind_at) <= now), now);
  const rows = [];
  for (const r of due ?? []) {
    const at = r.snoozed_until ?? r.remind_at;
    const t = new Date(at).getTime();
    if (t > now.getTime() || t < oldest || quiet.has(r.id)) continue;
    for (const ch of OUTSIDE) if ((r.channels as string[]).includes(ch)) {
      rows.push({ user_id: r.user_id, reminder_id: r.id, channel: ch, status: "pending", scheduled_for: at, attempt: 0, next_attempt_at: nowIso });
    }
  }
  if (rows.length) {
    const { data: inserted, error: insErr } = await db.from("reminder_deliveries")
      .upsert(rows, { onConflict: "reminder_id,channel,scheduled_for", ignoreDuplicates: true }).select("id");
    if (insErr) throw new Error(`Couldn't queue deliveries: ${insErr.message}`);
    summary.queued = inserted?.length ?? 0;
  }

  const { data: ready } = await db
    .from("reminder_deliveries")
    .select("id, user_id, reminder_id, channel, attempt")
    .eq("status", "pending")
    .in("channel", [...OUTSIDE])
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at")
    .limit(100);
  if (!ready?.length) return summary;

  const ids = [...new Set(ready.map((d) => d.reminder_id))];
  const { data: reminders } = await db.from("reminders").select("id, title, task_id, event_id, habit_id, roadmap_id, status").in("id", ids);
  const byId = new Map((reminders ?? []).map((r) => [r.id, r]));

  for (const d of ready) {
    const attempt = d.attempt + 1;
    const delay = RETRY_MINUTES[Math.min(d.attempt, RETRY_MINUTES.length - 1)];
    // Claim this attempt; if another sender got there first, nothing comes back.
    const { data: claimed } = await db.from("reminder_deliveries")
      .update({ attempt, next_attempt_at: new Date(now.getTime() + delay * 60_000).toISOString() })
      .eq("id", d.id).eq("status", "pending").eq("attempt", d.attempt).select("id");
    if (!claimed?.length) continue;

    const r = byId.get(d.reminder_id);
    let out: SendOutcome;
    if (!r || !["scheduled", "snoozed"].includes(r.status)) out = { status: "skipped", error: "The reminder was done or removed before it was sent." };
    else {
      try {
        out = await senders[d.channel as Outside](db, d.user_id, { title: r.title, body: r.habit_id ? "Habit reminder from Life OS" : r.roadmap_id ? "Study reminder from Life OS" : "Reminder from Life OS", url: linkFor(r), tag: `reminder-${r.id}` });
      } catch {
        out = { status: "retry", error: "Unexpected error while sending." };
      }
    }

    if (out.status === "sent") {
      await db.from("reminder_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), error: null, next_attempt_at: null }).eq("id", d.id);
      summary.sent++;
    } else if (out.status === "skipped") {
      await db.from("reminder_deliveries").update({ status: "skipped", error: out.error, next_attempt_at: null }).eq("id", d.id);
      summary.skipped++;
    } else if (attempt >= RETRY_MINUTES.length) {
      await db.from("reminder_deliveries").update({ status: "failed", error: out.error, next_attempt_at: null }).eq("id", d.id);
      summary.failed++;
    } else {
      await db.from("reminder_deliveries").update({ error: out.error }).eq("id", d.id);
      summary.retrying++;
    }
  }
  return summary;
}
