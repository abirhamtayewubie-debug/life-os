"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, localDateKey } from "@/lib/dates";
import { habitReminderRule, nextHabitReminder } from "@/lib/habit-reminder";
import { BOOK_FILE_TYPES, MAX_BOOK_FILE_BYTES } from "@/features/learning/types";
import { AREAS } from "@/features/tasks/types";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalDate, optionalText, optionalUrl, optionalUuid } from "./validation";

const optionalInt = (min: number, max: number, msg: string) =>
  z.union([z.literal(""), z.coerce.number().int(msg).min(min, msg).max(max, msg)]).optional().transform((v) => (v === "" || v === undefined ? null : v));

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
    /** Left out (undefined) keeps the stored value, so forms without page fields don't clear them. */
    totalPages: z.union([z.literal(""), z.coerce.number().int("Whole pages").min(1, "At least 1 page").max(20000, "Up to 20,000 pages")]).optional(),
    currentPage: z.union([z.literal(""), z.coerce.number().int("Whole pages").min(0, "0 or more").max(20000, "Up to 20,000 pages")]).optional(),
  })
  .refine((v) => !v.startedOn || !v.finishedOn || v.finishedOn >= v.startedOn, { path: ["finishedOn"], message: "Finish can't be before start" })
  .refine((v) => typeof v.totalPages !== "number" || typeof v.currentPage !== "number" || v.currentPage <= v.totalPages, { path: ["currentPage"], message: "Past the last page" });

export type LearningItemInput = z.input<typeof itemSchema>;

function refresh() {
  revalidatePath("/learning");
  revalidatePath("/goals");
  revalidatePath("/reports");
  revalidatePath("/reflection");
}

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

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
  const pages: { total_pages?: number | null; current_page?: number | null } = {};
  if (v.totalPages !== undefined) pages.total_pages = v.totalPages === "" ? null : v.totalPages;
  if (v.currentPage !== undefined) pages.current_page = v.currentPage === "" ? null : v.currentPage;
  // With both page numbers known, progress follows the page you're on.
  if (typeof pages.total_pages === "number" && typeof pages.current_page === "number" && !finished) row.progress_pct = Math.round((pages.current_page / pages.total_pages) * 100);
  if (finished && typeof pages.total_pages === "number") pages.current_page = pages.total_pages;
  Object.assign(row, pages);
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
  const { data, error } = await ctx.supabase.from("learning_items").delete().eq("id", id).select("file_path");
  if (error) return { ok: false, error: "Couldn't delete." };
  // Its uploaded file goes with it.
  const path = data?.[0]?.file_path;
  if (path) await ctx.supabase.storage.from(READING_BUCKET).remove([path]);
  refresh();
  return { ok: true, message: "Deleted." };
}

/* ------------------------------------------------------------------------ */
/* Book files (private Storage bucket, one file per item)                    */
/* ------------------------------------------------------------------------ */

const READING_BUCKET = "reading";

const fileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1, "That file is empty.").max(MAX_BOOK_FILE_BYTES, "Files can be up to 50 MB."),
  type: z.enum(BOOK_FILE_TYPES, "Upload a PDF, EPUB, text file or image."),
});

/** A storage-safe file name: letters, digits, dot, dash, underscore. */
const safeName = (name: string) => name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(-120) || "file";

/**
 * Step 1 of an upload: a one-time signed upload link for a path inside the
 * person's own folder. The browser sends the file straight to Storage with it.
 */
export async function prepareBookUpload(itemId: string, file: { name: string; size: number; type: string }): Promise<ActionResult<{ path: string; token: string }>> {
  if (!isUuid(itemId)) return { ok: false, error: "Invalid item." };
  const parsed = fileSchema.safeParse(file);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That file can't be uploaded." };
  const ctx = await liveContext();
  if (!ctx) return { ok: false, error: "Uploads need your own account. Demo mode doesn't save anything." };
  const { data: item } = await ctx.supabase.from("learning_items").select("id").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  const path = `${ctx.viewer.userId}/${itemId}/${crypto.randomUUID().slice(0, 8)}-${safeName(parsed.data.name)}`;
  const { data, error } = await ctx.supabase.storage.from(READING_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Has the reading storage been set up?" };
  return { ok: true, data: { path: data.path, token: data.token } };
}

/** Step 2: link the uploaded file to the item, and remove the file it replaces. */
export async function attachBookFile(itemId: string, path: string, file: { name: string; size: number; type: string }): Promise<ActionResult> {
  if (!isUuid(itemId) || typeof path !== "string") return { ok: false, error: "Invalid item." };
  const parsed = fileSchema.safeParse(file);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That file can't be attached." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const folder = `${ctx.viewer.userId}/${itemId}`;
  if (!path.startsWith(`${folder}/`) || path.slice(folder.length + 1).includes("/")) return { ok: false, error: "That file isn't in your folder." };
  const { data: listed } = await ctx.supabase.storage.from(READING_BUCKET).list(folder, { search: path.slice(folder.length + 1) });
  if (!listed?.some((o) => `${folder}/${o.name}` === path)) return { ok: false, error: "The upload didn't finish. Try again." };
  const { data: before } = await ctx.supabase.from("learning_items").select("file_path").eq("id", itemId).maybeSingle();
  const { data, error } = await ctx.supabase.from("learning_items")
    .update({ file_path: path, file_name: parsed.data.name, file_size: parsed.data.size, file_type: parsed.data.type }).eq("id", itemId).select("id");
  if (error || !data?.length) {
    await ctx.supabase.storage.from(READING_BUCKET).remove([path]);
    return { ok: false, error: "Couldn't attach the file." };
  }
  if (before?.file_path && before.file_path !== path) await ctx.supabase.storage.from(READING_BUCKET).remove([before.file_path]);
  refresh();
  revalidatePath("/reflection");
  return { ok: true, message: "File uploaded. Only you can open it." };
}

export async function removeBookFile(itemId: string): Promise<ActionResult> {
  if (!isUuid(itemId)) return { ok: false, error: "Invalid item." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data: item } = await ctx.supabase.from("learning_items").select("file_path").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "Item not found." };
  if (item.file_path) {
    const { error } = await ctx.supabase.storage.from(READING_BUCKET).remove([item.file_path]);
    if (error) return { ok: false, error: "Couldn't remove the file." };
  }
  await ctx.supabase.from("learning_items").update({ file_path: null, file_name: null, file_size: null, file_type: null }).eq("id", itemId);
  refresh();
  revalidatePath("/reflection");
  return { ok: true, message: "File removed." };
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

/* ------------------------------------------------------------------------ */
/* Roadmaps                                                                  */
/* ------------------------------------------------------------------------ */

const stepSchema = z.object({
  id: z.uuid().optional().or(z.literal("")).transform((v) => v || null),
  title: z.string().trim().min(1, "Name the step").max(300),
  isExercise: z.boolean().default(false),
  itemId: optionalUuid,
});

const roadmapSchema = z.object({
  title: z.string().trim().min(1, "Name the roadmap").max(200),
  description: optionalText(5000),
  goalId: optionalUuid,
  skillId: optionalUuid,
  targetDate: optionalDate,
  studyDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  studyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 19:00").or(z.literal("")).default(""),
  studyMinutes: optionalInt(5, 600, "Use 5 to 600 minutes"),
  remind: z.boolean().default(false),
  notifyDevices: z.boolean().default(true),
  steps: z.array(stepSchema).max(500, "Up to 500 steps"),
}).refine((v) => !v.remind || (v.studyDays.length > 0 && v.studyTime), { path: ["studyTime"], message: "Pick study days and a time to be reminded" });

export type RoadmapInput = z.input<typeof roadmapSchema>;

/** One repeating reminder per roadmap, on its study days at its time; removed when the plan or the switch is cleared. */
async function syncRoadmapReminder(ctx: Ctx, roadmapId: string, title: string, v: z.output<typeof roadmapSchema>): Promise<string | null> {
  const { data: current } = await ctx.supabase.from("reminders").select("id").eq("roadmap_id", roadmapId).in("status", ["scheduled", "snoozed"]);
  if (!v.remind || !v.studyTime || !v.studyDays.length) {
    if (current?.length) await ctx.supabase.from("reminders").update({ status: "cancelled", snoozed_until: null }).eq("roadmap_id", roadmapId).in("status", ["scheduled", "snoozed"]);
    return null;
  }
  const tz = ctx.viewer.profile.timezone;
  const rule = habitReminderRule({ cadence: "daily", schedule_days: v.studyDays });
  const next = nextHabitReminder(rule, v.studyTime, tz, new Date());
  if (!next) return "Couldn't work out when to remind you.";
  const row = {
    title: `Study: ${title}`.slice(0, 300), remind_at: next.toISOString(), timezone: tz, recurrence_rule: rule, status: "scheduled" as const, snoozed_until: null,
    channels: v.notifyDevices ? ["in_app", "web_push"] : ["in_app"],
  };
  const { error } = current?.length
    ? await ctx.supabase.from("reminders").update(row).eq("id", current[0].id)
    : await ctx.supabase.from("reminders").insert({ ...row, user_id: ctx.viewer.userId, roadmap_id: roadmapId, source: "manual" });
  return error ? "The roadmap was saved, but its reminder couldn't be set." : null;
}

/**
 * Saves a roadmap and its steps. Existing steps keep their id (so what's done
 * and the sessions logged against them stay), new ones are added, and steps
 * left out are removed.
 */
export async function saveRoadmap(id: string | null, input: RoadmapInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid roadmap." };
  const parsed = roadmapSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const row = {
    title: v.title, description: v.description, goal_id: v.goalId, skill_id: v.skillId, target_date: v.targetDate,
    study_days: [...new Set(v.studyDays)].sort(), study_time: v.studyTime || null, study_minutes: v.studyMinutes,
  };
  let roadmapId = id;
  if (id) {
    const { data, error } = await ctx.supabase.from("learning_roadmaps").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save the roadmap." };
    if (!data?.length) return { ok: false, error: "Roadmap not found." };
  } else {
    const { data, error } = await ctx.supabase.from("learning_roadmaps").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save the roadmap." };
    roadmapId = data.id;
  }

  const { data: existing } = await ctx.supabase.from("learning_steps").select("id").eq("roadmap_id", roadmapId!);
  const keep = new Set(v.steps.map((s) => s.id).filter(Boolean));
  const gone = (existing ?? []).map((s) => s.id).filter((x) => !keep.has(x));
  if (gone.length) {
    const { error } = await ctx.supabase.from("learning_steps").delete().in("id", gone);
    if (error) return { ok: false, error: "Couldn't update the steps." };
  }
  const known = new Set((existing ?? []).map((s) => s.id));
  for (const [i, st] of v.steps.entries()) {
    const fields = { position: i + 1, title: st.title, is_exercise: st.isExercise, learning_item_id: st.itemId };
    const { error } = st.id && known.has(st.id)
      ? await ctx.supabase.from("learning_steps").update(fields).eq("id", st.id)
      : await ctx.supabase.from("learning_steps").insert({ ...fields, user_id: ctx.viewer.userId, roadmap_id: roadmapId! });
    if (error) return { ok: false, error: "The roadmap was saved, but some steps weren't. Open it and try again." };
  }
  const remindErr = await syncRoadmapReminder(ctx, roadmapId!, v.title, v);
  refresh();
  return remindErr ? { ok: false, error: remindErr } : { ok: true, data: { id: roadmapId! }, message: v.remind ? "Roadmap saved with study reminders." : "Roadmap saved." };
}

export async function setStepDone(id: string, done: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid step." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("learning_steps").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't update the step." };
  refresh();
  return { ok: true };
}

export async function setRoadmapArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid roadmap." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("learning_roadmaps").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't update the roadmap." };
  // An archived roadmap stops reminding; restoring it doesn't silently turn reminders back on.
  if (archived) await ctx.supabase.from("reminders").update({ status: "cancelled", snoozed_until: null }).eq("roadmap_id", id).in("status", ["scheduled", "snoozed"]);
  refresh();
  return { ok: true, message: archived ? "Archived. Its reminders are off; your study history is kept." : "Restored." };
}

/** Deletes the roadmap, its steps and its reminder; logged study time is kept. */
export async function deleteRoadmap(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid roadmap." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("learning_roadmaps").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the roadmap." };
  refresh();
  return { ok: true, message: "Roadmap deleted. Your study history is kept." };
}

/* ------------------------------------------------------------------------ */
/* Study sessions                                                            */
/* ------------------------------------------------------------------------ */

const sessionSchema = z.object({
  date: dateKey,
  minutes: z.coerce.number("Enter minutes").int("Whole minutes").min(1, "At least 1 minute").max(1440, "Up to 24 hours"),
  roadmapId: optionalUuid,
  itemId: optionalUuid,
  stepId: optionalUuid,
  markStepDone: z.boolean().default(false),
  notes: optionalText(2000),
  pageFrom: optionalInt(1, 20000, "Use a page number"),
  pageTo: optionalInt(1, 20000, "Use a page number"),
}).refine((v) => v.pageFrom === null || v.pageTo === null || v.pageTo >= v.pageFrom, { path: ["pageTo"], message: "Ends before it starts" });

export type StudySessionInput = z.input<typeof sessionSchema>;

export async function logStudySession(input: StudySessionInput): Promise<ActionResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const today = localDateKey(new Date(), ctx.viewer.profile.timezone);
  if (v.date > today) return { ok: false, error: "That date is in the future.", fieldErrors: { date: ["Pick today or an earlier date."] } };
  if (v.date < addDays(today, -366)) return { ok: false, error: "That day is too far back.", fieldErrors: { date: ["Pick a date in the last year."] } };
  const { error } = await ctx.supabase.from("study_sessions").insert({
    user_id: ctx.viewer.userId, studied_on: v.date, minutes: v.minutes, roadmap_id: v.roadmapId, learning_item_id: v.itemId, step_id: v.stepId, notes: v.notes,
    page_from: v.pageFrom, page_to: v.pageTo, source: "manual",
  });
  if (error) return { ok: false, error: "Couldn't log the session." };
  if (v.itemId && v.pageTo !== null) await advanceReading(ctx, v.itemId, v.pageTo, v.date);
  if (v.stepId && v.markStepDone) await ctx.supabase.from("learning_steps").update({ done_at: new Date().toISOString() }).eq("id", v.stepId).is("done_at", null);
  refresh();
  return { ok: true, message: `Logged ${v.minutes} minutes.` };
}

/**
 * Reading moves the book along: the page you reached (never backwards),
 * progress from pages, started when first read, finished on the last page.
 */
async function advanceReading(ctx: Ctx, itemId: string, pageTo: number, date: string) {
  const { data: it } = await ctx.supabase.from("learning_items").select("status, total_pages, current_page, started_on").eq("id", itemId).maybeSingle();
  if (!it) return;
  const page = Math.max(it.current_page ?? 0, it.total_pages ? Math.min(pageTo, it.total_pages) : pageTo);
  const done = !!it.total_pages && page >= it.total_pages;
  const patch: Record<string, unknown> = { current_page: page };
  if (it.total_pages) patch.progress_pct = Math.round((page / it.total_pages) * 100);
  if (it.status === "planned" || it.status === "dropped") patch.status = "in_progress";
  if (!it.started_on) patch.started_on = date;
  if (done && it.status !== "completed") Object.assign(patch, { status: "completed", finished_on: date, progress_pct: 100 });
  await ctx.supabase.from("learning_items").update(patch).eq("id", itemId);
}

export async function deleteStudySession(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid session." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("study_sessions").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't delete the session." };
  refresh();
  return { ok: true, message: "Session deleted." };
}
