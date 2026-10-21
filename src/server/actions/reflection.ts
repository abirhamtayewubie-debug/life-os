"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalText } from "./validation";

const entrySchema = z.object({
  date: dateKey,
  kind: z.enum(["journal", "gratitude", "reflection", "prayer", "meditation", "intention"]).default("journal"),
  title: optionalText(200),
  body: z.string().trim().min(1, "Write something first").max(50000),
  mood: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
});

export type JournalInput = z.input<typeof entrySchema>;

function refresh() {
  revalidatePath("/reflection");
}

/** Entries stay private: is_private is always true and AI access off until the person opts in (phase 6). */
export async function saveJournalEntry(id: string | null, input: JournalInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid entry." };
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > localDateKey(new Date(), ctx.viewer.profile.timezone)) return { ok: false, error: "Pick today or an earlier date.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  const row = { entry_date: v.date, kind: v.kind, title: v.title, body: v.body, mood: v.mood };
  if (id) {
    const { data, error } = await ctx.supabase.from("journal_entries").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save the entry." };
    if (!data?.length) return { ok: false, error: "Entry not found." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("journal_entries").insert({ ...row, user_id: ctx.viewer.userId, is_private: true, ai_access_allowed: false, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the entry." };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Saved to your private journal." };
}

export async function deleteJournalEntry(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid entry." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("journal_entries").delete().eq("id", id).select("id, entry_date");
  if (error) return { ok: false, error: "Couldn't delete the entry." };
  if (!data?.length) return { ok: false, error: "Entry not found." };
  // The audit log records that an entry was deleted, never its contents.
  await audit(ctx, "journal_entry.deleted", { type: "journal_entry", id }, { entry_date: data[0].entry_date });
  refresh();
  return { ok: true, message: "Entry deleted." };
}

const valueSchema = z.object({ name: z.string().trim().min(1, "Name the value").max(60), description: optionalText(1000) });

export async function saveValue(id: string | null, input: z.input<typeof valueSchema>): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid value." };
  const parsed = valueSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  let error;
  if (id) ({ error } = await ctx.supabase.from("personal_values").update(parsed.data).eq("id", id));
  else {
    const { data: last } = await ctx.supabase.from("personal_values").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    ({ error } = await ctx.supabase.from("personal_values").insert({ ...parsed.data, user_id: ctx.viewer.userId, sort_order: (last?.[0]?.sort_order ?? -1) + 1 }));
  }
  if (error) return { ok: false, error: error.code === "23505" ? "You already have that value." : "Couldn't save the value." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteValue(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid value." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("personal_values").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove the value." };
  refresh();
  return { ok: true, message: "Removed." };
}
