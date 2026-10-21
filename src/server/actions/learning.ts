"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { AREAS } from "@/features/tasks/types";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";
import { invalid, isUuid, optionalDate, optionalText, optionalUrl, optionalUuid } from "./validation";

const optionalInt = (min: number, max: number, msg: string) =>
  z.union([z.coerce.number().int(msg).min(min, msg).max(max, msg), z.literal("")]).optional().transform((v) => (v === "" || v === undefined ? null : v));

const itemSchema = z
  .object({
    kind: z.enum(["book", "course", "article", "video", "podcast", "practice"]),
    title: z.string().trim().min(1, "Add a title").max(300),
    author: optionalText(200),
    url: optionalUrl,
    status: z.enum(["planned", "in_progress", "completed", "dropped"]).default("planned"),
    progress: optionalInt(0, 100, "Use 0 to 100"),
    startedOn: optionalDate,
    finishedOn: optionalDate,
    goalId: optionalUuid,
    notes: optionalText(10000),
  })
  .refine((v) => !v.startedOn || !v.finishedOn || v.finishedOn >= v.startedOn, { path: ["finishedOn"], message: "Finish can't be before start" });

export type LearningItemInput = z.input<typeof itemSchema>;

function refresh() {
  revalidatePath("/learning");
  revalidatePath("/goals");
}

export async function saveLearningItem(id: string | null, input: LearningItemInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid item." };
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  // Finishing something fills in the obvious gaps; nothing else is guessed.
  const finished = v.status === "completed";
  const row = {
    kind: v.kind, title: v.title, author: v.author, url: v.url, status: v.status, goal_id: v.goalId, notes: v.notes,
    progress_pct: finished ? 100 : v.progress,
    started_on: v.startedOn ?? (v.status === "in_progress" || finished ? today : null),
    finished_on: finished ? v.finishedOn ?? today : v.finishedOn,
  };
  if (row.started_on && row.finished_on && row.finished_on < row.started_on) row.started_on = row.finished_on;
  if (id) {
    const { data, error } = await ctx.supabase.from("learning_items").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save." };
    if (!data?.length) return { ok: false, error: "Item not found." };
    refresh();
    return { ok: true, data: { id }, message: "Saved." };
  }
  const { data, error } = await ctx.supabase.from("learning_items").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save." };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Added." };
}

export async function updateLearningProgress(id: string, progress: number): Promise<ActionResult> {
  if (!isUuid(id) || !Number.isInteger(progress) || progress < 0 || progress > 100) return { ok: false, error: "Use 0 to 100." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("learning_items").update({ progress_pct: progress }).eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't update progress." };
  if (!data?.length) return { ok: false, error: "Item not found." };
  refresh();
  return { ok: true, message: "Progress updated." };
}

export async function deleteLearningItem(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("learning_items").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete." };
  refresh();
  return { ok: true, message: "Deleted." };
}

const skillSchema = z.object({
  name: z.string().trim().min(1, "Name the skill").max(120),
  area: z.enum(AREAS).default("learning"),
  level: optionalInt(1, 5, "Use 1 to 5"),
  targetLevel: optionalInt(1, 5, "Use 1 to 5"),
  notes: optionalText(5000),
});

export type SkillInput = z.input<typeof skillSchema>;

export async function saveSkill(id: string | null, input: SkillInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid skill." };
  const parsed = skillSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const row = { name: v.name, area: v.area, level: v.level, target_level: v.targetLevel, notes: v.notes };
  const { error } = id
    ? await ctx.supabase.from("skills").update(row).eq("id", id)
    : await ctx.supabase.from("skills").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) return error.code === "23505" ? { ok: false, error: "You already track that skill.", fieldErrors: { name: ["You already track that skill."] } } : { ok: false, error: "Couldn't save the skill." };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteSkill(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid skill." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("skills").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the skill." };
  refresh();
  return { ok: true, message: "Deleted." };
}
