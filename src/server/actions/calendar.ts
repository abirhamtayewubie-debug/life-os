"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, diffDays, zonedTimeToUtc } from "@/lib/dates";
import { allDayIso, isSyncedEvent } from "@/lib/calendar";
import { isValidRule, parseRule, serializeRule } from "@/lib/recurrence";
import { syncSoon } from "@/server/google/sync";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

const uuid = z.uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time");

const eventSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a title").max(300),
    kind: z.enum(["event", "meeting", "appointment", "time_block"]).default("event"),
    allDay: z.boolean().default(false),
    startDate: dateKey,
    startTime: timeKey.optional().or(z.literal("")),
    endDate: dateKey,
    endTime: timeKey.optional().or(z.literal("")),
    location: z.string().trim().max(300).optional().default(""),
    description: z.string().trim().max(10000).optional().default(""),
    recurrenceRule: z.string().trim().max(200).optional().or(z.literal("")),
    taskId: uuid.optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (!v.allDay) {
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Pick a start time" });
      if (!v.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "Pick an end time" });
    }
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Ends before it starts" });
    else if (!v.allDay && v.startTime && v.endTime && v.endDate === v.startDate && v.endTime <= v.startTime)
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End after the start time" });
    if (diffDays(v.startDate, v.endDate) > 60) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Events can span at most 60 days" });
    if (v.recurrenceRule && !isValidRule(v.recurrenceRule)) ctx.addIssue({ code: "custom", path: ["recurrenceRule"], message: "This repeat rule isn't supported" });
  });

export type EventInput = z.input<typeof eventSchema>;

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

function toRow(v: z.output<typeof eventSchema>, tz: string) {
  const starts_at = v.allDay ? allDayIso(v.startDate) : zonedTimeToUtc(v.startDate, v.startTime!, tz).toISOString();
  const ends_at = v.allDay ? allDayIso(v.endDate) : zonedTimeToUtc(v.endDate, v.endTime!, tz).toISOString();
  return {
    title: v.title,
    kind: v.kind,
    all_day: v.allDay,
    starts_at,
    ends_at,
    timezone: tz,
    location: v.location || null,
    description: v.description || null,
    recurrence_rule: v.recurrenceRule ? serializeRule(parseRule(v.recurrenceRule)) : null,
    task_id: v.taskId || null,
  };
}

export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const row = toRow(parsed.data, ctx.viewer.profile.timezone);
  if (row.task_id) {
    // Only link tasks the caller owns (RLS hides others, so a miss means "not yours").
    const { data: t } = await ctx.supabase.from("tasks").select("id").eq("id", row.task_id).maybeSingle();
    if (!t) return { ok: false, error: "That task wasn't found." };
  }
  const { data, error } = await ctx.supabase.from("calendar_events").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the event." };
  refresh();
  syncSoon(ctx.viewer.userId);
  if (row.task_id) revalidatePath("/tasks");
  return { ok: true, data: { id: data.id }, message: row.kind === "time_block" ? "Time blocked." : "Event added." };
}

export async function updateEvent(id: string, input: EventInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid event." };
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: existing } = await ctx.supabase.from("calendar_events").select("id, external_provider, timezone").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, error: "Event not found." };
  if (isSyncedEvent(existing.external_provider)) return { ok: false, error: "This event comes from a connected calendar. Edit it there." };
  const { error } = await ctx.supabase.from("calendar_events").update(toRow(parsed.data, ctx.viewer.profile.timezone)).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save the event." };
  refresh();
  syncSoon(ctx.viewer.userId);
  return { ok: true, message: "Event updated." };
}

/** Move a timed event, keeping its duration (used by "move to" in the detail view). */
export async function moveEvent(id: string, date: string, time: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !dateKey.safeParse(date).success || !timeKey.safeParse(time).success) return { ok: false, error: "Invalid move." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: e } = await ctx.supabase.from("calendar_events").select("starts_at, ends_at, all_day, external_provider").eq("id", id).maybeSingle();
  if (!e) return { ok: false, error: "Event not found." };
  if (isSyncedEvent(e.external_provider)) return { ok: false, error: "This event comes from a connected calendar. Move it there." };
  const tz = ctx.viewer.profile.timezone;
  let starts: string;
  let ends: string;
  if (e.all_day) {
    const span = diffDays(e.starts_at.slice(0, 10), e.ends_at.slice(0, 10));
    starts = allDayIso(date);
    ends = allDayIso(addDays(date, span));
  } else {
    const dur = new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime();
    const s = zonedTimeToUtc(date, time, tz);
    starts = s.toISOString();
    ends = new Date(s.getTime() + dur).toISOString();
  }
  const { error } = await ctx.supabase.from("calendar_events").update({ starts_at: starts, ends_at: ends, timezone: tz }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't move the event." };
  refresh();
  syncSoon(ctx.viewer.userId);
  return { ok: true, message: "Event moved." };
}

/** Deletes the event (the whole series, for a repeating one). */
export async function deleteEvent(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid event." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("calendar_events").delete().eq("id", id).select("id, title");
  if (error) return { ok: false, error: "Couldn't delete the event." };
  if (!data?.length) return { ok: false, error: "Event not found." };
  await audit(ctx, "calendar_event.deleted", { type: "calendar_event", id }, { title: data[0].title });
  refresh();
  syncSoon(ctx.viewer.userId);
  return { ok: true, message: "Event deleted." };
}
