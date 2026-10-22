"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { isValidRule, nextOccurrence, parseRule, serializeRule } from "@/lib/recurrence";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";

const uuid = z.uuid();

const reminderSchema = z
  .object({
    title: z.string().trim().min(1, "What should we remind you about?").max(300),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time"),
    taskId: uuid.optional().or(z.literal("")),
    eventId: uuid.optional().or(z.literal("")),
    recurrenceRule: z.string().trim().max(200).optional().or(z.literal("")),
    notifyDevices: z.boolean().optional(),
  })
  .refine((v) => !v.recurrenceRule || isValidRule(v.recurrenceRule), { path: ["recurrenceRule"], message: "This repeat rule isn't supported" });

export type ReminderInput = z.input<typeof reminderSchema>;

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createReminder(input: ReminderInput): Promise<ActionResult> {
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const tz = ctx.viewer.profile.timezone;
  const v = parsed.data;
  const { error } = await ctx.supabase.from("reminders").insert({
    user_id: ctx.viewer.userId,
    title: v.title,
    remind_at: zonedTimeToUtc(v.date, v.time, tz).toISOString(),
    timezone: tz,
    task_id: v.taskId || null,
    event_id: v.eventId || null,
    recurrence_rule: v.recurrenceRule ? serializeRule(parseRule(v.recurrenceRule)) : null,
    channels: v.notifyDevices ? ["in_app", "web_push"] : ["in_app"],
    source: "manual",
  });
  if (error) return { ok: false, error: "Couldn't save the reminder." };
  refresh();
  return { ok: true, message: v.notifyDevices ? "Reminder set. It will appear in the app and on devices with notifications on." : "Reminder set. It will appear in the app at that time." };
}

const snoozeSchema = z.union([z.literal(10), z.literal(60), z.literal(180), z.literal("tomorrow")]);

export async function snoozeReminder(id: string, by: 10 | 60 | 180 | "tomorrow"): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !snoozeSchema.safeParse(by).success) return { ok: false, error: "Invalid snooze." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const tz = ctx.viewer.profile.timezone;
  const until = by === "tomorrow"
    ? zonedTimeToUtc(addDays(localDateKey(new Date(), tz), 1), "09:00", tz)
    : new Date(Date.now() + by * 60_000);
  const { data, error } = await ctx.supabase.from("reminders").update({ status: "snoozed", snoozed_until: until.toISOString() }).eq("id", id).in("status", ["scheduled", "snoozed", "delivered"]).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't snooze the reminder." };
  refresh();
  return { ok: true, message: by === "tomorrow" ? "Snoozed until 9:00 tomorrow." : `Snoozed for ${by >= 60 ? `${by / 60} hour${by > 60 ? "s" : ""}` : `${by} minutes`}.` };
}

/** Done: one-off reminders complete; repeating ones move to the next occurrence. */
export async function completeReminder(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid reminder." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: r } = await ctx.supabase.from("reminders").select("id, remind_at, timezone, recurrence_rule").eq("id", id).maybeSingle();
  if (!r) return { ok: false, error: "Reminder not found." };

  if (r.recurrence_rule) {
    const tz = r.timezone;
    const key = localDateKey(new Date(r.remind_at), tz);
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(r.remind_at));
    const today = localDateKey(new Date(), tz);
    const next = nextOccurrence(parseRule(r.recurrence_rule), key, today > key ? today : key);
    if (next) {
      const { error } = await ctx.supabase.from("reminders").update({ status: "scheduled", snoozed_until: null, remind_at: zonedTimeToUtc(next, wall, tz).toISOString() }).eq("id", id);
      if (error) return { ok: false, error: "Couldn't update the reminder." };
      refresh();
      return { ok: true, message: `Done. Next reminder ${next}.` };
    }
  }
  const { error } = await ctx.supabase.from("reminders").update({ status: "completed", snoozed_until: null, completed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the reminder." };
  refresh();
  return { ok: true, message: "Reminder done." };
}

export async function cancelReminder(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid reminder." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("reminders").update({ status: "cancelled", snoozed_until: null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove the reminder." };
  refresh();
  return { ok: true, message: "Reminder removed." };
}

/**
 * Reminders due now, for the in-app notifier. Records an in_app delivery the
 * first time each one is shown, so the history is honest about what was seen.
 */
export async function claimDueReminders(): Promise<ActionResult<{ id: string; title: string; at: string }[]>> {
  const ctx = await liveContext();
  if (!ctx) return { ok: true, data: [] };
  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("reminders")
    .select("id, title, remind_at, snoozed_until, status")
    .in("status", ["scheduled", "snoozed"])
    .lte("remind_at", now)
    .order("remind_at")
    .limit(20);
  if (error) return { ok: false, error: "Couldn't check reminders." };
  const due = (data ?? []).filter((r) => (r.snoozed_until ?? r.remind_at) <= now);
  const out: { id: string; title: string; at: string }[] = [];
  for (const r of due) {
    const at = r.snoozed_until ?? r.remind_at;
    // unique (reminder_id, channel, scheduled_for) makes this idempotent across tabs.
    const { error: insErr } = await ctx.supabase.from("reminder_deliveries").insert({
      user_id: ctx.viewer.userId, reminder_id: r.id, channel: "in_app", status: "sent", scheduled_for: at, sent_at: now, attempt: 1,
    });
    if (!insErr) out.push({ id: r.id, title: r.title, at });
  }
  return { ok: true, data: out };
}
