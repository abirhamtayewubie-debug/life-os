"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalDate, optionalText, optionalUuid } from "./validation";

function refresh() {
  revalidatePath("/relationships");
  revalidatePath("/");
}

const personSchema = z.object({
  name: z.string().trim().min(1, "Add a name").max(120),
  relationship: optionalText(60),
  birthday: optionalDate,
  contactEveryDays: z.union([z.coerce.number().int("Use whole days").min(1, "Use 1 to 365 days").max(365, "Use 1 to 365 days"), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  notes: optionalText(10000),
});

export type PersonInput = z.input<typeof personSchema>;

export async function savePerson(id: string | null, input: PersonInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid person." };
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.birthday && v.birthday > localDateKey(new Date(), ctx.viewer.profile.timezone)) return { ok: false, error: "A birthday can't be in the future.", fieldErrors: { birthday: ["A birthday can't be in the future."] } };
  const row = { name: v.name, relationship: v.relationship, birthday: v.birthday, contact_every_days: v.contactEveryDays, notes: v.notes };
  if (id) {
    const { data, error } = await ctx.supabase.from("people").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save." };
    if (!data?.length) return { ok: false, error: "Person not found." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("people").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  return { ok: true, data: { id: data.id }, message: `${v.name} added.` };
}

/** Removes the person with their interactions and dates (cascade). */
export async function deletePerson(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid person." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("people").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't delete." };
  if (!data?.length) return { ok: false, error: "Person not found." };
  await audit(ctx, "person.deleted", { type: "person", id });
  refresh();
  return { ok: true, message: "Removed." };
}

const interactionSchema = z.object({
  personId: z.uuid(),
  date: dateKey,
  kind: z.enum(["call", "message", "visit", "meal", "event", "other"]).default("other"),
  note: optionalText(2000),
});

export async function logInteraction(input: z.input<typeof interactionSchema>): Promise<ActionResult> {
  const parsed = interactionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > localDateKey(new Date(), ctx.viewer.profile.timezone)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  const { error } = await ctx.supabase.from("interactions").insert({ person_id: v.personId, occurred_on: v.date, kind: v.kind, note: v.note, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return { ok: false, error: error.code === "23503" ? "Person not found." : "Couldn't log it." };
  refresh();
  return { ok: true, message: "Logged." };
}

export async function deleteInteraction(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid entry." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("interactions").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete." };
  refresh();
  return { ok: true, message: "Deleted." };
}

const dateSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(200),
  kind: z.enum(["birthday", "anniversary", "memorial", "renewal", "other"]).default("other"),
  date: dateKey,
  recursYearly: z.boolean().default(true),
  remindDaysBefore: z.coerce.number().int().min(0, "Use 0 to 60 days").max(60, "Use 0 to 60 days").default(3),
  personId: optionalUuid,
});

export type ImportantDateInput = z.input<typeof dateSchema>;

export async function saveImportantDate(id: string | null, input: ImportantDateInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid date." };
  const parsed = dateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const row = { title: v.title, kind: v.kind, date: v.date, recurs_yearly: v.recursYearly, remind_days_before: v.remindDaysBefore, person_id: v.personId };
  const { error } = id
    ? await ctx.supabase.from("important_dates").update(row).eq("id", id)
    : await ctx.supabase.from("important_dates").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return { ok: false, error: "Couldn't save the date." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteImportantDate(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid date." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("important_dates").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the date." };
  refresh();
  return { ok: true, message: "Deleted." };
}
