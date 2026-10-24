"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, localDateKey } from "@/lib/dates";
import { habitReminderRule, nextHabitReminder } from "@/lib/habit-reminder";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

const uuid = z.uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const habitSchema = z
  .object({
    name: z.string().trim().min(1, "Name the habit").max(120),
    description: z.string().trim().max(2000).optional().default(""),
    cadence: z.enum(["daily", "weekly"]).default("daily"),
    scheduleDays: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
    targetPerPeriod: z.coerce.number().int().min(1, "At least once").max(50),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "anytime"]).default("anytime"),
    goalId: z.uuid().optional().or(z.literal("")),
    /** Planned local time, "HH:MM"; empty when the habit has no set time. */
    scheduledTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time").optional().or(z.literal("")).default(""),
    remind: z.boolean().default(false),
    notifyDevices: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.remind && !v.scheduledTime) ctx.addIssue({ code: "custom", path: ["scheduledTime"], message: "Pick a time to be reminded at" });
    if (v.cadence === "daily" && v.scheduleDays.length === 0) ctx.addIssue({ code: "custom", path: ["scheduleDays"], message: "Pick at least one day" });
    if (v.cadence === "weekly" && v.targetPerPeriod > 7 * 10) ctx.addIssue({ code: "custom", path: ["targetPerPeriod"], message: "That's a lot per week" });
  });

export type HabitInput = z.input<typeof habitSchema>;

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/");
}

function toRow(v: z.output<typeof habitSchema>) {
  return {
    name: v.name,
    description: v.description || null,
    cadence: v.cadence,
    // Weekly habits count on any day; keep the full week stored for them.
    schedule_days: v.cadence === "daily" ? [...new Set(v.scheduleDays)].sort() : [0, 1, 2, 3, 4, 5, 6],
    target_per_period: v.targetPerPeriod,
    time_of_day: v.timeOfDay,
    goal_id: v.goalId || null,
    scheduled_time: v.scheduledTime || null,
  };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

/**
 * Keeps one repeating reminder per habit in step with its schedule, or
 * cancels it. Delivery is the normal reminder pipeline (in-app, plus push
 * when the person asked for their devices).
 */
async function syncHabitReminder(ctx: Ctx, habitId: string, v: z.output<typeof habitSchema>): Promise<string | null> {
  const { data: current } = await ctx.supabase.from("reminders").select("id").eq("habit_id", habitId).in("status", ["scheduled", "snoozed"]);
  if (!v.remind || !v.scheduledTime) {
    if (current?.length) await ctx.supabase.from("reminders").update({ status: "cancelled", snoozed_until: null }).eq("habit_id", habitId).in("status", ["scheduled", "snoozed"]);
    return null;
  }
  const tz = ctx.viewer.profile.timezone;
  const rule = habitReminderRule({ cadence: v.cadence, schedule_days: v.scheduleDays });
  const next = nextHabitReminder(rule, v.scheduledTime, tz, new Date());
  if (!next) return "Couldn't work out when to remind you.";
  const row = {
    title: v.name, remind_at: next.toISOString(), timezone: tz, recurrence_rule: rule, status: "scheduled" as const, snoozed_until: null,
    channels: v.notifyDevices ? ["in_app", "web_push"] : ["in_app"],
  };
  const { error } = current?.length
    ? await ctx.supabase.from("reminders").update(row).eq("id", current[0].id)
    : await ctx.supabase.from("reminders").insert({ ...row, user_id: ctx.viewer.userId, habit_id: habitId, source: "manual" });
  return error ? "The habit was saved, but its reminder couldn't be set." : null;
}

export async function createHabit(input: HabitInput): Promise<ActionResult<{ id: string }>> {
  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("habits").insert({ ...toRow(parsed.data), user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the habit." };
  const remindErr = await syncHabitReminder(ctx, data.id, parsed.data);
  refresh();
  return remindErr ? { ok: false, error: remindErr } : { ok: true, data: { id: data.id }, message: parsed.data.remind ? "Habit added with a reminder." : "Habit added." };
}

export async function updateHabit(id: string, input: HabitInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid habit." };
  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("habits").update(toRow(parsed.data)).eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't save the habit." };
  if (!data?.length) return { ok: false, error: "Habit not found." };
  const remindErr = await syncHabitReminder(ctx, id, parsed.data);
  refresh();
  return remindErr ? { ok: false, error: remindErr } : { ok: true, message: "Habit updated." };
}

/**
 * Set how many times a habit was done on a local date (0 clears the day).
 * Only today and the past year can be logged: no logging the future.
 */
export async function logHabit(habitId: string, date: string, count: number): Promise<ActionResult> {
  if (!uuid.safeParse(habitId).success || !dateKey.safeParse(date).success || !Number.isInteger(count) || count < 0 || count > 100)
    return { ok: false, error: "Invalid log." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  if (date > today) return { ok: false, error: "You can't log a day that hasn't happened yet." };
  if (date < addDays(today, -366)) return { ok: false, error: "That day is too far back to change." };
  const { error } = count === 0
    ? await ctx.supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("log_date", date)
    : await ctx.supabase.from("habit_logs").upsert({ user_id: ctx.viewer.userId, habit_id: habitId, log_date: date, count, source: "manual" }, { onConflict: "habit_id,log_date" });
  if (error) return { ok: false, error: "Couldn't update the habit." };
  refresh();
  return { ok: true };
}

export async function setHabitPaused(id: string, paused: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid habit." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("habits").update({ paused_at: paused ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the habit." };
  refresh();
  return { ok: true, message: paused ? "Paused. It won't count against you until you resume." : "Resumed." };
}

export async function setHabitArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid habit." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("habits").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the habit." };
  refresh();
  return { ok: true, message: archived ? "Archived. Its history is kept." : "Restored." };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid habit." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("habits").delete().eq("id", id).select("id, name");
  if (error) return { ok: false, error: "Couldn't delete the habit." };
  if (!data?.length) return { ok: false, error: "Habit not found." };
  await audit(ctx, "habit.deleted", { type: "habit", id }, { name: data[0].name });
  refresh();
  return { ok: true, message: "Habit and its history deleted." };
}
