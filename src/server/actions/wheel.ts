"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { SUGGESTED_CATEGORIES } from "@/features/wheel/types";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalText } from "./validation";

function refresh() {
  revalidatePath("/wheel");
  revalidatePath("/goals");
  revalidatePath("/");
}

const score = z.coerce.number().int().min(1, "1–10").max(10, "1–10");

const assessmentSchema = z.object({
  date: dateKey,
  note: optionalText(5000),
  ratings: z
    .array(z.object({ categoryId: z.uuid(), score, desired: score.optional().or(z.literal("")).transform((v) => (v === "" || v === undefined ? null : v)) }))
    .min(1, "Rate at least one area")
    .max(30),
});

export type AssessmentInput = z.input<typeof assessmentSchema>;

/** Create or replace the assessment for a date. Ratings are the person's own, subjective 1–10 scores. */
export async function saveAssessment(id: string | null, input: AssessmentInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid assessment." };
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > localDateKey(new Date(), ctx.viewer.profile.timezone))
    return { ok: false, error: "Pick today or a past date.", fieldErrors: { date: ["Pick today or a past date."] } };

  let assessmentId = id;
  if (assessmentId) {
    const { error } = await ctx.supabase.from("wheel_assessments").update({ assessed_on: v.date, note: v.note }).eq("id", assessmentId);
    if (error) return { ok: false, error: error.code === "23505" ? "There's already an assessment on that date." : "Couldn't save the assessment." };
  } else {
    const { data, error } = await ctx.supabase.from("wheel_assessments").insert({ user_id: ctx.viewer.userId, assessed_on: v.date, note: v.note }).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "There's already an assessment on that date. Open it to edit." : "Couldn't save the assessment." };
    assessmentId = data.id;
  }
  const { error: rErr } = await ctx.supabase.from("wheel_ratings").upsert(
    v.ratings.map((r) => ({ user_id: ctx.viewer.userId, assessment_id: assessmentId, category_id: r.categoryId, score: r.score, desired_score: r.desired })),
    { onConflict: "assessment_id,category_id" },
  );
  if (rErr) {
    // A new assessment without its ratings is meaningless; remove it.
    if (!id) await ctx.supabase.from("wheel_assessments").delete().eq("id", assessmentId!);
    return { ok: false, error: "Couldn't save the ratings." };
  }
  refresh();
  return { ok: true, data: { id: assessmentId! }, message: "Assessment saved." };
}

export async function deleteAssessment(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid assessment." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("wheel_assessments").delete().eq("id", id).select("id, assessed_on");
  if (error) return { ok: false, error: "Couldn't delete the assessment." };
  if (!data?.length) return { ok: false, error: "Assessment not found." };
  await audit(ctx, "wheel_assessment.deleted", { type: "wheel_assessment", id }, { assessed_on: data[0].assessed_on });
  refresh();
  return { ok: true, message: "Assessment deleted." };
}

const nameSchema = z.string().trim().min(1, "Name the area").max(60);

export async function addCategory(name: string): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: last } = await ctx.supabase.from("wheel_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  const { error } = await ctx.supabase.from("wheel_categories").insert({ user_id: ctx.viewer.userId, name: parsed.data, sort_order: (last?.[0]?.sort_order ?? -1) + 1 });
  if (error) return { ok: false, error: error.code === "23505" ? "You already have an area with that name." : "Couldn't add the area." };
  refresh();
  return { ok: true, message: "Area added." };
}

/** Adds the suggested set the person chose to start with (only when they have none). */
export async function addSuggestedCategories(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { count } = await ctx.supabase.from("wheel_categories").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (count) return { ok: false, error: "You already have areas. Add more one at a time." };
  const { error } = await ctx.supabase.from("wheel_categories").insert(SUGGESTED_CATEGORIES.map((name, i) => ({ user_id: ctx.viewer.userId, name, sort_order: i })));
  if (error) return { ok: false, error: "Couldn't add the areas." };
  refresh();
  return { ok: true, message: "Areas added. Rename or remove any that don't fit." };
}

export async function renameCategory(id: string, name: string): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(name);
  if (!isUuid(id) || !parsed.success) return { ok: false, error: "Give the area a name." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("wheel_categories").update({ name: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "You already have an area with that name." : "Couldn't rename the area." };
  refresh();
  return { ok: true, message: "Renamed." };
}

/** Archiving keeps past ratings for history; the area just stops appearing in new assessments. */
export async function setCategoryArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid area." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("wheel_categories").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "An active area already has that name." : "Couldn't update the area." };
  refresh();
  return { ok: true, message: archived ? "Area archived. Past ratings are kept." : "Area restored." };
}
