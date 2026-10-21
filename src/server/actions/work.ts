"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zonedTimeToUtc } from "@/lib/dates";
import { fromMinor, toMinor } from "@/lib/money";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalDate, optionalText, optionalUuid } from "./validation";

const AREAS = ["personal", "work", "family", "health", "finance", "learning", "home", "spiritual", "community"] as const;

const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Name the project").max(160),
    description: optionalText(5000),
    status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).default("active"),
    area: z.enum(AREAS).default("work"),
    goalId: optionalUuid,
    startDate: optionalDate,
    dueDate: optionalDate,
    budgetAmount: z.string().trim().optional().default(""),
    budgetCurrency: z.string().trim().toUpperCase().optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date is before the start" });
    if (v.budgetAmount) {
      if (!/^\d{1,15}(\.\d{1,4})?$/.test(v.budgetAmount)) ctx.addIssue({ code: "custom", path: ["budgetAmount"], message: "Use an amount like 25000 or 1200.50" });
      if (!/^[A-Z]{3}$/.test(v.budgetCurrency)) ctx.addIssue({ code: "custom", path: ["budgetCurrency"], message: "Pick a currency" });
    }
  });

export type ProjectInput = z.input<typeof projectSchema>;

function refresh() {
  revalidatePath("/work");
  revalidatePath("/goals");
  revalidatePath("/tasks");
  revalidatePath("/");
}

function toRow(v: z.output<typeof projectSchema>) {
  // Stored as an exact decimal string, rounded to the currency's minor unit.
  const amount = v.budgetAmount ? fromMinor(toMinor(v.budgetAmount, v.budgetCurrency), v.budgetCurrency) : null;
  return {
    name: v.name, description: v.description, status: v.status, area: v.area, goal_id: v.goalId,
    start_date: v.startDate, due_date: v.dueDate,
    budget_amount: amount, budget_currency: amount ? v.budgetCurrency : null,
  };
}

export async function createProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("projects").insert({ ...toRow(parsed.data), user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
  if (error) return { ok: false, error: error.code === "23503" ? "That currency or goal isn't available." : "Couldn't save the project." };
  refresh();
  return { ok: true, data: { id: data.id }, message: "Project added." };
}

export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid project." };
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("projects").update(toRow(parsed.data)).eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't save the project." };
  if (!data?.length) return { ok: false, error: "Project not found." };
  refresh();
  return { ok: true, message: "Project saved." };
}

export async function setProjectStatus(id: string, status: z.infer<typeof projectSchema>["status"]): Promise<ActionResult> {
  if (!isUuid(id) || !projectSchema.shape.status.safeParse(status).success) return { ok: false, error: "Invalid project." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("projects").update({ status }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't update the project." };
  refresh();
  return { ok: true, message: "Project updated." };
}

/** Deletes the project with its milestones and time log; its tasks are kept, unlinked. */
export async function deleteProject(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid project." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("projects").delete().eq("id", id).select("id, name");
  if (error) return { ok: false, error: "Couldn't delete the project." };
  if (!data?.length) return { ok: false, error: "Project not found." };
  await audit(ctx, "project.deleted", { type: "project", id }, { name: data[0].name });
  refresh();
  return { ok: true, message: "Project deleted. Its tasks were kept." };
}

/* Time tracking ----------------------------------------------------------- */

export async function startTimer(projectId: string, taskId: string | null, note: string): Promise<ActionResult> {
  const parsed = z.object({ projectId: z.uuid(), taskId: optionalUuid, note: optionalText(1000) }).safeParse({ projectId, taskId: taskId ?? "", note });
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const now = new Date().toISOString();
  // Stop any running timer first, so there is never more than one.
  await ctx.supabase.from("time_entries").update({ ended_at: now }).is("ended_at", null);
  const { error } = await ctx.supabase.from("time_entries").insert({
    user_id: ctx.viewer.userId, project_id: parsed.data.projectId, task_id: parsed.data.taskId, note: parsed.data.note, started_at: now,
  });
  if (error) return { ok: false, error: "Couldn't start the timer." };
  revalidatePath("/work");
  return { ok: true, message: "Timer started." };
}

export async function stopTimer(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: running } = await ctx.supabase.from("time_entries").select("id, started_at").is("ended_at", null).maybeSingle();
  if (!running) return { ok: false, error: "No timer is running." };
  const start = new Date(running.started_at).getTime();
  // Cap at 24 hours: a timer left running overnight shouldn't invent a working day.
  const end = Math.min(Date.now(), start + 24 * 3600_000);
  const { error } = await ctx.supabase.from("time_entries").update({ ended_at: new Date(Math.max(end, start + 60_000)).toISOString() }).eq("id", running.id);
  if (error) return { ok: false, error: "Couldn't stop the timer." };
  revalidatePath("/work");
  return { ok: true, message: end - start >= 24 * 3600_000 ? "Stopped at 24 hours. Edit the entry if that's not right." : "Time logged." };
}

const manualSchema = z
  .object({
    projectId: z.uuid({ message: "Pick a project" }),
    date: dateKey,
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a start time"),
    minutes: z.coerce.number().int().min(1, "At least a minute").max(1440, "At most 24 hours"),
    note: optionalText(1000),
  });

export async function logTime(input: z.input<typeof manualSchema>): Promise<ActionResult> {
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const start = zonedTimeToUtc(v.date, v.start, ctx.viewer.profile.timezone);
  if (start.getTime() > Date.now()) return { ok: false, error: "That time hasn't happened yet.", fieldErrors: { date: ["That time hasn't happened yet."] } };
  const { error } = await ctx.supabase.from("time_entries").insert({
    user_id: ctx.viewer.userId, project_id: v.projectId, started_at: start.toISOString(), ended_at: new Date(start.getTime() + v.minutes * 60000).toISOString(), note: v.note,
  });
  if (error) return { ok: false, error: "Couldn't log the time." };
  revalidatePath("/work");
  return { ok: true, message: "Time logged." };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid entry." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("time_entries").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't delete the entry." };
  revalidatePath("/work");
  return { ok: true, message: "Entry deleted." };
}
