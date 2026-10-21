"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalDate, optionalText, optionalUuid } from "./validation";

// Decimal strings only (numeric(19,4)); never parsed to float before storage.
const decimal = z.string().trim().regex(/^-?\d{1,15}(\.\d{1,4})?$/, "Use a number, up to 4 decimals");
const optionalDecimal = decimal.optional().or(z.literal("")).transform((v) => v || null);

const goalSchema = z
  .object({
    title: z.string().trim().min(1, "Name the goal").max(200),
    level: z.enum(["vision", "long_term", "annual", "quarterly"]),
    parentId: optionalUuid,
    wheelCategoryId: optionalUuid,
    description: optionalText(5000),
    why: optionalText(2000),
    targetDate: optionalDate,
    metricLabel: optionalText(60),
    metricTarget: optionalDecimal,
    metricCurrent: optionalDecimal,
  })
  .superRefine((v, ctx) => {
    if (v.metricTarget !== null && !v.metricLabel) ctx.addIssue({ code: "custom", path: ["metricLabel"], message: "What are you measuring?" });
    if (v.metricTarget !== null && Number(v.metricTarget) <= 0) ctx.addIssue({ code: "custom", path: ["metricTarget"], message: "The target must be above zero" });
    if (v.metricCurrent !== null && v.metricTarget === null) ctx.addIssue({ code: "custom", path: ["metricTarget"], message: "Set a target to track progress" });
  });

export type GoalInput = z.input<typeof goalSchema>;

function refresh() {
  revalidatePath("/goals");
  revalidatePath("/");
}

function toRow(v: z.output<typeof goalSchema>) {
  return {
    title: v.title, level: v.level, parent_id: v.parentId, wheel_category_id: v.wheelCategoryId, description: v.description, why: v.why,
    target_date: v.targetDate, metric_label: v.metricLabel, metric_target: v.metricTarget, metric_current: v.metricCurrent,
  };
}

const dbError = (msg: string | undefined, fallback: string) =>
  msg?.includes("broader goal") ? "A goal can only sit under a broader one (vision → long-term → year → quarter)."
  : msg?.includes("own sub-goal") ? "A goal can't sit under one of its own sub-goals."
  : fallback;

export async function createGoal(input: GoalInput): Promise<ActionResult<{ id: string }>> {
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("goals").insert({ ...toRow(parsed.data), user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: dbError(error.message, "Couldn't save the goal.") };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Goal added." };
}

export async function updateGoal(id: string, input: GoalInput): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid goal." };
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("goals").update(toRow(parsed.data)).eq("id", id).select("id");
  if (error) return { ok: false, error: dbError(error.message, "Couldn't save the goal.") };
  if (!data?.length) return { ok: false, error: "Goal not found." };
  refresh();
  return { ok: true, message: "Goal saved." };
}

const STATUS_MESSAGE = { active: "Goal is active again.", paused: "Paused. No pressure.", completed: "Achieved. Well done.", abandoned: "Let go. It stays in your history." } as const;

export async function setGoalStatus(id: string, status: keyof typeof STATUS_MESSAGE): Promise<ActionResult> {
  if (!isUuid(id) || !(status in STATUS_MESSAGE)) return { ok: false, error: "Invalid goal." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("goals").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the goal." };
  refresh();
  return { ok: true, message: STATUS_MESSAGE[status] };
}

/** Deletes the goal. Sub-goals move up a level; projects, tasks and habits are unlinked, not deleted. */
export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid goal." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("goals").delete().eq("id", id).select("id, title");
  if (error) return { ok: false, error: "Couldn't delete the goal." };
  if (!data?.length) return { ok: false, error: "Goal not found." };
  await audit(ctx, "goal.deleted", { type: "goal", id }, { title: data[0].title });
  refresh();
  return { ok: true, message: "Goal deleted." };
}

/** Log a new measured value; it becomes the goal's current value. */
export async function logGoalProgress(goalId: string, value: string, note: string): Promise<ActionResult> {
  const parsed = z.object({ goalId: z.uuid(), value: decimal, note: optionalText(1000) }).safeParse({ goalId, value, note });
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: goal } = await ctx.supabase.from("goals").select("id, metric_target").eq("id", goalId).maybeSingle();
  if (!goal) return { ok: false, error: "Goal not found." };
  if (goal.metric_target === null) return { ok: false, error: "Set a target on this goal first." };
  const { error } = await ctx.supabase.from("goal_progress_entries").insert({ user_id: ctx.viewer.userId, goal_id: goalId, value: parsed.data.value, note: parsed.data.note });
  if (error) return { ok: false, error: "Couldn't log progress." };
  await ctx.supabase.from("goals").update({ metric_current: parsed.data.value }).eq("id", goalId);
  refresh();
  return { ok: true, message: "Progress logged." };
}

/* Milestones (shared by goals and projects) ------------------------------- */

const milestoneSchema = z
  .object({ title: z.string().trim().min(1, "Name the milestone").max(200), dueDate: optionalDate, goalId: optionalUuid, projectId: optionalUuid })
  .refine((v) => (v.goalId === null) !== (v.projectId === null), { message: "A milestone belongs to one goal or project", path: ["title"] });

export async function addMilestone(input: z.input<typeof milestoneSchema>): Promise<ActionResult> {
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const parent = v.goalId ? ctx.supabase.from("milestones").select("sort_order").eq("goal_id", v.goalId) : ctx.supabase.from("milestones").select("sort_order").eq("project_id", v.projectId!);
  const { data: last } = await parent.order("sort_order", { ascending: false }).limit(1);
  const { error } = await ctx.supabase.from("milestones").insert({
    user_id: ctx.viewer.userId, title: v.title, due_date: v.dueDate, goal_id: v.goalId, project_id: v.projectId, sort_order: (last?.[0]?.sort_order ?? -1) + 1,
  });
  if (error) return { ok: false, error: "Couldn't add the milestone." };
  refresh();
  revalidatePath("/work");
  return { ok: true };
}

export async function setMilestoneDone(id: string, done: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid milestone." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("milestones").update({ completed_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the milestone." };
  refresh();
  revalidatePath("/work");
  return { ok: true };
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid milestone." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("milestones").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the milestone." };
  refresh();
  revalidatePath("/work");
  return { ok: true, message: "Milestone removed." };
}

export async function updateMilestoneDate(id: string, dueDate: string): Promise<ActionResult> {
  if (!isUuid(id) || (dueDate && !dateKey.safeParse(dueDate).success)) return { ok: false, error: "Invalid date." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("milestones").update({ due_date: dueDate || null }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the milestone." };
  refresh();
  revalidatePath("/work");
  return { ok: true };
}
