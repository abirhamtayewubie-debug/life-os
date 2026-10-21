"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { isValidRule, nextOccurrence, parseRule, serializeRule } from "@/lib/recurrence";
import { AREAS } from "@/features/tasks/types";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

const uuid = z.uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time");

const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(300),
    notes: z.string().trim().max(10000).optional().default(""),
    priority: z.coerce.number().int().min(1).max(4).default(3),
    area: z.enum(AREAS).default("personal"),
    status: z.enum(["todo", "in_progress", "waiting"]).default("todo"),
    dueDate: dateKey.optional().or(z.literal("")),
    dueTime: timeKey.optional().or(z.literal("")),
    isTopPriority: z.boolean().default(false),
    recurrenceRule: z.string().trim().max(200).optional().or(z.literal("")),
    estimateMinutes: z.coerce.number().int().min(1).max(10080).optional().or(z.literal("").transform(() => undefined)),
    projectId: uuid.optional().or(z.literal("")),
    parentTaskId: uuid.optional().or(z.literal("")),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.dueTime && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Pick a date for this time" });
    if (v.recurrenceRule) {
      if (!isValidRule(v.recurrenceRule)) ctx.addIssue({ code: "custom", path: ["recurrenceRule"], message: "This repeat rule isn't supported" });
      if (!v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Repeating tasks need a due date" });
    }
  });

export type TaskInput = z.input<typeof taskSchema>;

function toRow(v: z.output<typeof taskSchema>, tz: string) {
  const timed = Boolean(v.dueDate && v.dueTime);
  return {
    title: v.title,
    notes: v.notes || null,
    priority: v.priority,
    area: v.area,
    status: v.status,
    due_date: v.dueDate && !timed ? v.dueDate : null,
    due_at: timed ? zonedTimeToUtc(v.dueDate!, v.dueTime!, tz).toISOString() : null,
    is_top_priority: v.isTopPriority,
    recurrence_rule: v.recurrenceRule ? serializeRule(parseRule(v.recurrenceRule)) : null,
    recurrence_tz: v.recurrenceRule ? tz : null,
    estimate_minutes: v.estimateMinutes ?? null,
    project_id: v.projectId || null,
    parent_task_id: v.parentTaskId || null,
  };
}

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
}

function friendly(message: string): string {
  if (message.includes("cycle") || message.includes("own subtask")) return message;
  if (message.includes("foreign key")) return "A linked project or task no longer exists.";
  return "Couldn't save the task. Please try again.";
}

async function syncTags(ctx: Ctx, taskId: string, names: string[]) {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  const { data: existing } = await ctx.supabase.from("tags").select("id, name");
  const byName = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  const missing = unique.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length) {
    const { data: created } = await ctx.supabase.from("tags").insert(missing.map((name) => ({ user_id: ctx.viewer.userId, name }))).select("id, name");
    for (const t of created ?? []) byName.set(t.name.toLowerCase(), t.id);
  }
  await ctx.supabase.from("task_tags").delete().eq("task_id", taskId);
  const ids = unique.map((n) => byName.get(n.toLowerCase())).filter(Boolean) as string[];
  if (ids.length) await ctx.supabase.from("task_tags").insert(ids.map((tag_id) => ({ user_id: ctx.viewer.userId, task_id: taskId, tag_id })));
}

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  revalidatePath("/work");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({ ...toRow(parsed.data, ctx.viewer.profile.timezone), user_id: ctx.viewer.userId, source: "manual" })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error.message) };
  if (parsed.data.tags.length) await syncTags(ctx, data.id, parsed.data.tags);
  refresh();
  return { ok: true, data: { id: data.id }, message: "Task added." };
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid task." };
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.parentTaskId === id) return { ok: false, error: "A task can't be its own subtask." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("tasks").update(toRow(parsed.data, ctx.viewer.profile.timezone)).eq("id", id).select("id");
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "Task not found." };
  await syncTags(ctx, id, parsed.data.tags);
  refresh();
  return { ok: true, message: "Task saved." };
}

/**
 * Marks a task done or reopens it. Completing an occurrence of a repeating
 * task creates the next occurrence (same series) unless the series has ended.
 */
export async function setTaskStatus(id: string, status: "todo" | "in_progress" | "waiting" | "done" | "cancelled"): Promise<ActionResult<{ nextDue?: string | null }>> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid task." };
  if (!["todo", "in_progress", "waiting", "done", "cancelled"].includes(status)) return { ok: false, error: "Invalid status." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;

  const { data: task, error: readErr } = await ctx.supabase
    .from("tasks")
    .select("id, title, notes, priority, area, status, due_date, due_at, is_top_priority, recurrence_rule, recurrence_tz, estimate_minutes, project_id, goal_id, parent_task_id, series_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !task) return { ok: false, error: "Task not found." };

  const wasOpen = ["todo", "in_progress", "waiting"].includes(task.status);
  const { error } = await ctx.supabase
    .from("tasks")
    .update(status === "done" ? { status, completed_at: new Date().toISOString() } : { status, completed_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the task." };

  let nextDue: string | null | undefined;
  if (status === "done" && wasOpen && task.recurrence_rule) {
    nextDue = await spawnNextOccurrence(ctx, task);
  }
  refresh();
  const message = status === "done"
    ? nextDue ? `Done. Next one is due ${nextDue}.` : nextDue === null ? "Done. That was the last in the series." : "Task completed."
    : status === "cancelled" ? "Task cancelled." : "Task reopened.";
  return { ok: true, data: { nextDue }, message };
}

type SeriesTask = {
  id: string; title: string; notes: string | null; priority: number; area: string; due_date: string | null; due_at: string | null;
  recurrence_rule: string | null; recurrence_tz: string | null; estimate_minutes: number | null; project_id: string | null;
  goal_id: string | null; parent_task_id: string | null; series_id: string | null;
};

async function spawnNextOccurrence(ctx: Ctx, task: SeriesTask): Promise<string | null> {
  const tz = task.recurrence_tz ?? ctx.viewer.profile.timezone;
  const rule = parseRule(task.recurrence_rule!);
  const currentKey = task.due_date ?? localDateKey(new Date(task.due_at!), tz);
  // COUNT is consumed one occurrence at a time.
  if (rule.count !== undefined && rule.count <= 1) return null;
  const next = nextOccurrence({ ...rule, count: undefined }, currentKey, currentKey);
  if (!next || (rule.until && next > rule.until)) return null;
  const nextRule = rule.count !== undefined ? { ...rule, count: rule.count - 1 } : rule;

  const seriesId = task.series_id ?? task.id;
  if (!task.series_id) await ctx.supabase.from("tasks").update({ series_id: seriesId }).eq("id", task.id);

  let dueAt: string | null = null;
  if (task.due_at) {
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(task.due_at));
    dueAt = zonedTimeToUtc(next, wall, tz).toISOString();
  }
  const { data: created, error } = await ctx.supabase
    .from("tasks")
    .insert({
      user_id: ctx.viewer.userId, title: task.title, notes: task.notes, priority: task.priority, area: task.area,
      due_date: task.due_at ? null : next, due_at: dueAt, recurrence_rule: serializeRule(nextRule), recurrence_tz: tz,
      estimate_minutes: task.estimate_minutes, project_id: task.project_id, goal_id: task.goal_id, parent_task_id: task.parent_task_id,
      series_id: seriesId, source: "manual",
    })
    .select("id")
    .single();
  // 23505: an open occurrence already exists (e.g. reopened then completed again).
  if (error) return error.code === "23505" ? next : null;
  const { data: tags } = await ctx.supabase.from("task_tags").select("tag_id").eq("task_id", task.id);
  if (tags?.length) await ctx.supabase.from("task_tags").insert(tags.map((t) => ({ user_id: ctx.viewer.userId, task_id: created.id, tag_id: t.tag_id })));
  return next;
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid task." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("tasks").delete().eq("id", id).select("id, title");
  if (error) return { ok: false, error: "Couldn't delete the task." };
  if (!data?.length) return { ok: false, error: "Task not found." };
  await audit(ctx, "task.deleted", { type: "task", id }, { title: data[0].title });
  refresh();
  return { ok: true, message: "Task deleted." };
}

export async function addSubtask(parentId: string, title: string): Promise<ActionResult> {
  if (!uuid.safeParse(parentId).success) return { ok: false, error: "Invalid task." };
  const t = z.string().trim().min(1).max(300).safeParse(title);
  if (!t.success) return { ok: false, error: "Give the subtask a title." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: parent } = await ctx.supabase.from("tasks").select("area, project_id, goal_id").eq("id", parentId).maybeSingle();
  if (!parent) return { ok: false, error: "Task not found." };
  const { error } = await ctx.supabase.from("tasks").insert({ user_id: ctx.viewer.userId, parent_task_id: parentId, title: t.data, area: parent.area, project_id: parent.project_id, goal_id: parent.goal_id, source: "manual" });
  if (error) return { ok: false, error: friendly(error.message) };
  refresh();
  return { ok: true };
}

export async function setDependency(taskId: string, dependsOnId: string, on: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(taskId).success || !uuid.safeParse(dependsOnId).success) return { ok: false, error: "Invalid task." };
  if (taskId === dependsOnId) return { ok: false, error: "A task can't depend on itself." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = on
    ? await ctx.supabase.from("task_dependencies").insert({ user_id: ctx.viewer.userId, task_id: taskId, depends_on_task_id: dependsOnId })
    : await ctx.supabase.from("task_dependencies").delete().eq("task_id", taskId).eq("depends_on_task_id", dependsOnId);
  if (error) return { ok: false, error: error.message.includes("cycle") ? "That would make the tasks wait on each other in a loop." : error.code === "23505" ? "Already linked." : "Couldn't update the dependency." };
  refresh();
  return { ok: true };
}

const viewSchema = z.object({
  name: z.string().trim().min(1, "Name the view").max(60),
  filters: z.object({
    view: z.enum(["today", "upcoming", "overdue", "nodate", "all", "done"]),
    q: z.string().max(100).optional(),
    priority: z.number().int().min(1).max(4).optional(),
    area: z.enum(AREAS).optional(),
    tag: uuid.optional(),
    project: uuid.optional(),
  }),
});

export async function saveTaskView(input: z.input<typeof viewSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = viewSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase
    .from("saved_views")
    .insert({ user_id: ctx.viewer.userId, module_key: "tasks", name: parsed.data.name, filters: parsed.data.filters })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "You already have a view with that name." : "Couldn't save the view." };
  revalidatePath("/tasks");
  return { ok: true, data: { id: data.id }, message: "View saved." };
}

export async function deleteTaskView(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid view." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("saved_views").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the view." };
  revalidatePath("/tasks");
  return { ok: true, message: "View deleted." };
}
