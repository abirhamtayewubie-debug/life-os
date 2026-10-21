"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey } from "@/lib/dates";
import { WIDGETS, type WidgetPref } from "@/features/dashboard/widgets";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";
import { setTaskStatus } from "./tasks";

const uuid = z.uuid();

const reviewSchema = z.object({
  achievements: z.string().trim().max(5000).optional().default(""),
  unfinished: z.string().trim().max(5000).optional().default(""),
  priorities: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  mood: z.coerce.number().int().min(1).max(5).nullable().default(null),
  energy: z.coerce.number().int().min(1).max(5).nullable().default(null),
  notes: z.string().trim().max(5000).optional().default(""),
});

export type EveningReviewInput = z.input<typeof reviewSchema>;

export async function saveEveningReview(input: EveningReviewInput): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;

  const v = parsed.data;
  const review_date = localDateKey(new Date(), ctx.viewer.profile.timezone);
  const { error } = await ctx.supabase.from("daily_reviews").upsert(
    {
      user_id: ctx.viewer.userId,
      review_date,
      kind: "evening",
      achievements: v.achievements || null,
      unfinished: v.unfinished || null,
      tomorrow_priorities: v.priorities,
      mood: v.mood,
      energy: v.energy,
      notes: v.notes || null,
      source: "manual",
    },
    { onConflict: "user_id,review_date,kind" },
  );
  if (error) return { ok: false, error: "Couldn't save your review. Please try again." };
  revalidatePath("/");
  return { ok: true, message: "Evening review saved." };
}

export async function setTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  // Shares the Tasks module's logic so repeating tasks roll forward here too.
  const r = await setTaskStatus(taskId, done ? "done" : "todo");
  return r.ok ? { ok: true, message: r.message } : r;
}

export async function setHabitDoneToday(habitId: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(habitId).success) return { ok: false, error: "Invalid habit." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const log_date = localDateKey(new Date(), ctx.viewer.profile.timezone);
  const { error } = done
    ? await ctx.supabase.from("habit_logs").upsert({ user_id: ctx.viewer.userId, habit_id: habitId, log_date, count: 1, source: "manual" }, { onConflict: "habit_id,log_date" })
    : await ctx.supabase.from("habit_logs").delete().eq("habit_id", habitId).eq("log_date", log_date);
  if (error) return { ok: false, error: "Couldn't update the habit." };
  revalidatePath("/");
  return { ok: true };
}

const layoutSchema = z
  .array(
    z.object({
      key: z.enum(WIDGETS.map((w) => w.key) as [string, ...string[]]),
      size: z.enum(["sm", "md", "lg", "full"]),
      visible: z.boolean(),
    }),
  )
  .max(WIDGETS.length)
  .refine((xs) => new Set(xs.map((x) => x.key)).size === xs.length, "Duplicate widgets")
  .refine((xs) => xs.every((x) => WIDGETS.find((w) => w.key === x.key)!.sizes.includes(x.size)), "Unsupported size");

export async function saveDashboardLayout(layout: WidgetPref[]): Promise<ActionResult> {
  const parsed = layoutSchema.safeParse(layout);
  if (!parsed.success) return { ok: false, error: "Invalid layout." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const rows = parsed.data.map((w, i) => ({ user_id: ctx.viewer.userId, widget_key: w.key, size: w.size, visible: w.visible, sort_order: i }));
  const { error } = await ctx.supabase.from("dashboard_widgets").upsert(rows, { onConflict: "user_id,widget_key" });
  if (error) return { ok: false, error: "Couldn't save the layout." };
  revalidatePath("/");
  return { ok: true, message: "Layout saved." };
}

export async function resetDashboardLayout(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("dashboard_widgets").delete().eq("user_id", ctx.viewer.userId);
  if (error) return { ok: false, error: "Couldn't reset the layout." };
  revalidatePath("/");
  return { ok: true, message: "Layout reset." };
}
