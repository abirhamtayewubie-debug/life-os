"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, localDateKey } from "@/lib/dates";
import { periodOf } from "@/features/reflection/reviews";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalText, optionalUuid } from "./validation";

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

/** New entries are private, with AI access off. Sharing is a separate, deliberate step (setJournalSharing). */
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

/**
 * Lets the assistant read one entry, or makes it private again. An entry is
 * either private or shareable, never both (the database enforces it).
 */
export async function setJournalSharing(id: string, share: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof share !== "boolean") return { ok: false, error: "Invalid entry." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("journal_entries").update({ is_private: !share, ai_access_allowed: share }).eq("id", id).select("id, entry_date");
  if (error) return { ok: false, error: "Couldn't change sharing." };
  if (!data?.length) return { ok: false, error: "Entry not found." };
  await audit(ctx, share ? "journal_entry.shared_with_ai" : "journal_entry.made_private", { type: "journal_entry", id }, { entry_date: data[0].entry_date });
  refresh();
  revalidatePath("/assistant");
  return { ok: true, message: share ? "The assistant may read this entry (if Journal is switched on in Settings)." : "Private again. The assistant can't read it." };
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

/* ------------------------------------------------------------------------ */
/* Meditation                                                                */
/* ------------------------------------------------------------------------ */

const meditationSchema = z.object({
  title: z.string().trim().min(1, "Give it a name").max(200),
  url: z.string().trim().max(2000).refine((u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } }, "Paste a full link starting with https://"),
  minutes: z.union([z.coerce.number("Enter minutes").int("Whole minutes").min(1, "At least 1 minute").max(600, "Up to 10 hours"), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  category: optionalText(60),
  notes: optionalText(2000),
  favourite: z.boolean().default(false),
});

export type MeditationInput = z.input<typeof meditationSchema>;

export async function saveMeditation(id: string | null, input: MeditationInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid meditation." };
  const parsed = meditationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const row = parsed.data;
  if (id) {
    const { data, error } = await ctx.supabase.from("meditation_links").update(row).eq("id", id).select("id");
    if (error || !data?.length) return { ok: false, error: "Couldn't save the meditation." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("meditation_links").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save the meditation." };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Added to your meditations." };
}

export async function setMeditationFavourite(id: string, favourite: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof favourite !== "boolean") return { ok: false, error: "Invalid meditation." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("meditation_links").update({ favourite }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the meditation." };
  refresh();
  return { ok: true };
}

export async function setMeditationArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!isUuid(id) || typeof archived !== "boolean") return { ok: false, error: "Invalid meditation." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("meditation_links").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the meditation." };
  refresh();
  return { ok: true, message: archived ? "Archived. Your practice history is kept." : "Restored." };
}

export async function deleteMeditation(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid meditation." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("meditation_links").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the meditation." };
  refresh();
  return { ok: true, message: "Deleted. Your practice history is kept." };
}

const practiceSchema = z.object({
  date: dateKey,
  minutes: z.coerce.number("Enter minutes").int("Whole minutes").min(1, "At least 1 minute").max(1440, "Up to 24 hours"),
  linkId: optionalUuid,
  notes: optionalText(2000),
});

export type PracticeInput = z.input<typeof practiceSchema>;

export async function logMeditation(input: PracticeInput): Promise<ActionResult> {
  const parsed = practiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  if (v.date > today) return { ok: false, error: "That date is in the future.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  if (v.date < addDays(today, -366)) return { ok: false, error: "That day is too far back.", fieldErrors: { date: ["Pick a date in the last year."] } };
  const { error } = await ctx.supabase.from("meditation_sessions").insert({ user_id: ctx.viewer.userId, practiced_on: v.date, minutes: v.minutes, link_id: v.linkId, notes: v.notes, source: "manual" });
  if (error) return { ok: false, error: "Couldn't log the practice." };
  refresh();
  revalidatePath("/reports");
  return { ok: true, message: `Logged ${v.minutes} minutes of meditation.` };
}

export async function deleteMeditationSession(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid session." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("meditation_sessions").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the session." };
  refresh();
  revalidatePath("/reports");
  return { ok: true, message: "Session deleted." };
}

/* ------------------------------------------------------------------------ */
/* Weekly and monthly reviews (daily_reviews, one row per period)            */
/* ------------------------------------------------------------------------ */

const periodReviewSchema = z.object({
  kind: z.enum(["weekly", "monthly"]),
  date: dateKey,
  achievements: optionalText(5000),
  unfinished: optionalText(5000),
  priorities: z.array(z.string().trim().max(200)).max(10).default([]).transform((xs) => xs.filter(Boolean)),
  mood: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  energy: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  notes: optionalText(5000),
});

export type PeriodReviewInput = z.input<typeof periodReviewSchema>;

/** Saves the review for the week or month containing `date`. Saving again updates the same row. */
export async function savePeriodReview(input: PeriodReviewInput): Promise<ActionResult> {
  const parsed = periodReviewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  const { data: prof } = await ctx.supabase.from("profiles").select("week_starts_on").eq("id", ctx.viewer.userId).maybeSingle();
  const p = periodOf(v.kind, v.date, prof?.week_starts_on ?? 1);
  if (p.start > today) return { ok: false, error: "That period hasn't started yet." };
  if (!v.achievements && !v.unfinished && !v.priorities.length && !v.notes && v.mood === null && v.energy === null) return { ok: false, error: "Write at least one line first." };
  const { error } = await ctx.supabase.from("daily_reviews").upsert({
    user_id: ctx.viewer.userId, review_date: p.start, kind: v.kind, achievements: v.achievements, unfinished: v.unfinished,
    tomorrow_priorities: v.priorities, mood: v.mood, energy: v.energy, notes: v.notes, source: "manual",
  }, { onConflict: "user_id,review_date,kind" });
  if (error) return { ok: false, error: "Couldn't save the review." };
  refresh();
  revalidatePath("/");
  return { ok: true, message: v.kind === "weekly" ? "Weekly review saved." : "Monthly review saved." };
}

export async function deleteReview(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid review." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("daily_reviews").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the review." };
  refresh();
  revalidatePath("/");
  return { ok: true, message: "Review deleted." };
}
