"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { renewedDueDate } from "@/features/admin/status";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { invalid, isUuid, optionalDate, optionalText } from "./validation";

const itemSchema = z
  .object({
    kind: z.enum(["renewal", "document", "chore", "record"]),
    title: z.string().trim().min(1, "Add a title").max(200),
    category: optionalText(60),
    dueOn: optionalDate,
    repeatMonths: z.union([z.coerce.number().int("Use whole months").min(1, "Use 1 to 120 months").max(120, "Use 1 to 120 months"), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
    remindDaysBefore: z.coerce.number().int().min(0, "Use 0 to 365 days").max(365, "Use 0 to 365 days").default(14),
    location: optionalText(300),
    reference: optionalText(200),
    notes: optionalText(5000),
  })
  .refine((v) => v.kind === "document" || v.kind === "record" || v.dueOn, { path: ["dueOn"], message: "Add the date it's due" });

export type AdminItemInput = z.input<typeof itemSchema>;

function refresh() {
  revalidatePath("/admin");
}

export async function saveAdminItem(id: string | null, input: AdminItemInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid item." };
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const row = {
    kind: v.kind, title: v.title, category: v.category, due_on: v.dueOn, remind_days_before: v.remindDaysBefore,
    repeat_months: v.kind === "renewal" ? v.repeatMonths : null, location: v.location, reference: v.reference, notes: v.notes,
  };
  if (id) {
    const { data, error } = await ctx.supabase.from("admin_items").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save." };
    if (!data?.length) return { ok: false, error: "Item not found." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("admin_items").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Added." };
}

/** A repeating renewal moves to its next due date; anything else is marked done. */
export async function markAdminDone(id: string): Promise<ActionResult<{ nextDue: string | null }>> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: item, error } = await ctx.supabase.from("admin_items").select("kind, due_on, repeat_months").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "Couldn't update." };
  if (!item) return { ok: false, error: "Item not found." };
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  const nextDue = item.kind === "renewal" && item.repeat_months && item.due_on ? renewedDueDate(item.due_on, item.repeat_months, today) : null;
  const { error: upErr } = await ctx.supabase.from("admin_items").update(nextDue ? { due_on: nextDue } : { completed_at: new Date().toISOString() }).eq("id", id);
  if (upErr) return { ok: false, error: "Couldn't update." };
  await audit(ctx, nextDue ? "admin_item.renewed" : "admin_item.completed", { type: "admin_item", id }, nextDue ? { from: item.due_on, to: nextDue } : {});
  refresh();
  return { ok: true, data: { nextDue }, message: nextDue ? "Renewed. Next due date moved on." : "Marked done." };
}

export async function reopenAdminItem(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("admin_items").update({ completed_at: null }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23514" ? "Add a due date before reopening it." : "Couldn't reopen." };
  refresh();
  return { ok: true, message: "Reopened." };
}

export async function deleteAdminItem(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("admin_items").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't delete." };
  if (!data?.length) return { ok: false, error: "Item not found." };
  await audit(ctx, "admin_item.deleted", { type: "admin_item", id });
  refresh();
  return { ok: true, message: "Deleted." };
}
