"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { rangeFor, sleepInstants, type BodyMetric } from "@/features/health/metrics";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { dateKey, invalid, isUuid, optionalText, optionalUuid } from "./validation";

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

const today = (ctx: Ctx) => localDateKey(new Date(), ctx.viewer.profile.timezone);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 23:30");
const optionalScale = z.union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(5)]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const optionalInt = (min: number, max: number, msg: string) =>
  z.union([z.literal(""), z.null(), z.coerce.number().int(msg).min(min, msg).max(max, msg)]).optional().transform((v) => (v === "" || v === undefined ? null : v));
const optionalNumber = (min: number, max: number, msg: string) =>
  z.union([z.literal(""), z.null(), z.coerce.number(msg).min(min, msg).max(max, msg)]).optional().transform((v) => (v === "" || v === undefined ? null : v));

const futureError = (field: string): ActionResult<never> => ({ ok: false, error: "That date is in the future.", fieldErrors: { [field]: ["Pick today or an earlier date."] } });

function refresh() {
  revalidatePath("/health");
  revalidatePath("/sleep");
  revalidatePath("/reports");
  revalidatePath("/");
}

async function remove(table: string, id: string, what: string, auditDate?: { column: string; action: string }): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: `Invalid ${what}.` };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from(table).delete().eq("id", id).select(auditDate ? `id, ${auditDate.column}` : "id");
  if (error) return { ok: false, error: `Couldn't delete the ${what}.` };
  if (!data?.length) return { ok: false, error: `That ${what} wasn't found.` };
  // Health deletions are audited by date only, never by value.
  if (auditDate) await audit(ctx, auditDate.action, { type: table, id }, { date: (data[0] as unknown as Record<string, string>)[auditDate.column] });
  refresh();
  return { ok: true, message: "Deleted." };
}

/* ------------------------------------------------------------------------ */
/* Check-ins and water                                                       */
/* ------------------------------------------------------------------------ */

const checkinSchema = z.object({
  date: dateKey,
  mood: optionalScale,
  energy: optionalScale,
  stress: optionalScale,
  note: optionalText(2000),
}).refine((v) => v.mood !== null || v.energy !== null || v.stress !== null, { path: ["mood"], message: "Rate at least one of mood, energy or stress" });

export type CheckinInput = z.input<typeof checkinSchema>;

export async function saveCheckin(id: string | null, input: CheckinInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid check-in." };
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const t = today(ctx);
  if (v.date > t) return futureError("date");
  const row = { log_date: v.date, mood: v.mood, energy: v.energy, stress: v.stress, note: v.note };
  const { error } = id
    ? await ctx.supabase.from("wellness_logs").update(row).eq("id", id)
    : await ctx.supabase.from("wellness_logs").insert({
      ...row, user_id: ctx.viewer.userId, source: "manual",
      // A check-in for an earlier day is stamped at noon that day; today's at the real time.
      logged_at: v.date === t ? new Date().toISOString() : zonedTimeToUtc(v.date, "12:00", ctx.viewer.profile.timezone).toISOString(),
    });
  if (error) return { ok: false, error: "Couldn't save the check-in." };
  refresh();
  return { ok: true, message: "Check-in saved." };
}

export async function deleteCheckin(id: string): Promise<ActionResult> {
  return remove("wellness_logs", id, "check-in", { column: "log_date", action: "wellness.deleted" });
}

const waterSchema = z.object({ date: dateKey, ml: z.coerce.number().int("Use whole millilitres").min(1, "Use 1 to 5000 ml").max(5000, "Use 1 to 5000 ml") });

export async function addWater(input: z.input<typeof waterSchema>): Promise<ActionResult> {
  const parsed = waterSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  if (parsed.data.date > today(ctx)) return futureError("date");
  const { error } = await ctx.supabase.from("hydration_logs").insert({ user_id: ctx.viewer.userId, log_date: parsed.data.date, amount_ml: parsed.data.ml, source: "manual" });
  if (error) return { ok: false, error: "Couldn't add it." };
  refresh();
  return { ok: true, message: `Added ${parsed.data.ml} ml.` };
}

export async function deleteWater(id: string): Promise<ActionResult> {
  return remove("hydration_logs", id, "entry");
}

/* ------------------------------------------------------------------------ */
/* Workouts                                                                  */
/* ------------------------------------------------------------------------ */

const setSchema = z.object({
  exercise: z.string().trim().min(1, "Name the exercise").max(80),
  reps: optionalInt(0, 1000, "Use 0 to 1000"),
  weight: optionalNumber(0, 2000, "Use 0 to 2000"),
  unit: z.enum(["kg", "lb"]).default("kg"),
  seconds: optionalInt(0, 86400, "Use up to 24 hours"),
  km: optionalNumber(0, 1000, "Use 0 to 1000 km"),
});

const workoutSchema = z.object({
  date: dateKey,
  time: time.or(z.literal("")).default(""),
  activity: z.string().trim().min(1, "Name the activity").max(80),
  duration: optionalInt(1, 1440, "Use 1 to 1440 minutes"),
  effort: optionalInt(1, 10, "Use 1 to 10"),
  notes: optionalText(2000),
  goalId: optionalUuid,
  sets: z.array(setSchema).max(100, "Up to 100 sets"),
});

export type WorkoutInput = z.input<typeof workoutSchema>;

/** Saves a workout and replaces its sets (numbered per exercise, in the order given). */
export async function saveWorkout(id: string | null, input: WorkoutInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid workout." };
  const parsed = workoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.date > today(ctx)) return futureError("date");
  const row = {
    performed_on: v.date, activity: v.activity, duration_minutes: v.duration, perceived_effort: v.effort, notes: v.notes, goal_id: v.goalId,
    started_at: v.time ? zonedTimeToUtc(v.date, v.time, ctx.viewer.profile.timezone).toISOString() : null,
  };
  let workoutId = id;
  if (id) {
    const { data, error } = await ctx.supabase.from("workouts").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save the workout." };
    if (!data?.length) return { ok: false, error: "Workout not found." };
    const { error: delErr } = await ctx.supabase.from("workout_sets").delete().eq("workout_id", id);
    if (delErr) return { ok: false, error: "Couldn't update the sets." };
  } else {
    const { data, error } = await ctx.supabase.from("workouts").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save the workout." };
    workoutId = data.id;
  }
  if (v.sets.length) {
    const counter = new Map<string, number>();
    const sets = v.sets.map((s) => {
      const key = s.exercise.toLowerCase();
      const n = (counter.get(key) ?? 0) + 1;
      counter.set(key, n);
      return {
        user_id: ctx.viewer.userId, workout_id: workoutId!, exercise: s.exercise, set_number: n, reps: s.reps,
        weight: s.weight, weight_unit: s.weight === null ? null : s.unit, duration_seconds: s.seconds, distance_m: s.km === null ? null : Math.round(s.km * 1000 * 100) / 100,
      };
    });
    const { error } = await ctx.supabase.from("workout_sets").insert(sets);
    if (error) return { ok: false, error: "The workout was saved, but its sets weren't. Open it and try again." };
  }
  refresh();
  return { ok: true, data: { id: workoutId! }, message: "Workout saved." };
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  return remove("workouts", id, "workout", { column: "performed_on", action: "workout.deleted" });
}

/* ------------------------------------------------------------------------ */
/* Body measurements                                                         */
/* ------------------------------------------------------------------------ */

const metricEnum = z.enum(["weight", "body_fat_pct", "waist", "hip", "chest", "resting_hr", "blood_pressure_sys", "blood_pressure_dia"]);

const measurementSchema = z.object({
  date: dateKey,
  time: time.or(z.literal("")).default(""),
  entries: z.array(z.object({ metric: metricEnum, value: z.coerce.number("Enter a number").positive("Enter a number above 0"), unit: z.string().max(12) })).min(1, "Enter a value").max(8),
});

export type MeasurementInput = z.input<typeof measurementSchema>;

/** Saves one or more readings taken at the same moment (a blood pressure reading is two). */
export async function saveMeasurements(input: MeasurementInput): Promise<ActionResult> {
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const at = zonedTimeToUtc(v.date, v.time || "08:00", ctx.viewer.profile.timezone);
  if (at.getTime() > Date.now() + 60_000) return futureError("date");
  for (const e of v.entries) {
    const range = rangeFor(e.metric as BodyMetric, e.unit);
    if (!range) return { ok: false, error: "Pick a unit for that measurement.", fieldErrors: { unit: ["Pick a unit."] } };
    if (e.value < range[0] || e.value > range[1]) return { ok: false, error: `That looks off: use ${range[0]} to ${range[1]} ${e.unit}.`, fieldErrors: { [e.metric]: [`Use ${range[0]} to ${range[1]} ${e.unit}.`] } };
  }
  if (v.entries.some((e) => e.metric === "blood_pressure_sys") !== v.entries.some((e) => e.metric === "blood_pressure_dia"))
    return { ok: false, error: "Enter both blood pressure numbers.", fieldErrors: { blood_pressure_dia: ["Enter both numbers."] } };
  const sys = v.entries.find((e) => e.metric === "blood_pressure_sys")?.value;
  const dia = v.entries.find((e) => e.metric === "blood_pressure_dia")?.value;
  if (sys !== undefined && dia !== undefined && dia >= sys) return { ok: false, error: "The second number is usually the lower one.", fieldErrors: { blood_pressure_dia: ["Should be lower than the first number."] } };
  const rows = v.entries.map((e) => ({ user_id: ctx.viewer.userId, measured_at: at.toISOString(), metric: e.metric, value: e.value, unit: e.unit, source: "manual" as const }));
  const { error } = await ctx.supabase.from("body_measurements").insert(rows);
  if (error) return { ok: false, error: error.code === "23505" ? "You already have that measurement at that time. Edit or delete it first." : "Couldn't save it." };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Deletes readings by id (both halves of a blood pressure reading together). */
export async function deleteMeasurements(ids: string[]): Promise<ActionResult> {
  if (!ids.length || ids.length > 8 || !ids.every(isUuid)) return { ok: false, error: "Invalid measurement." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("body_measurements").delete().in("id", ids).select("id, measured_at");
  if (error) return { ok: false, error: "Couldn't delete it." };
  if (!data?.length) return { ok: false, error: "Not found." };
  await audit(ctx, "measurement.deleted", { type: "body_measurements" }, { count: data.length, date: data[0].measured_at.slice(0, 10) });
  refresh();
  return { ok: true, message: "Deleted." };
}

/* ------------------------------------------------------------------------ */
/* Sleep                                                                     */
/* ------------------------------------------------------------------------ */

const sleepSchema = z.object({
  wakeDate: dateKey,
  bed: time,
  wake: time,
  quality: optionalScale,
  awakenings: optionalInt(0, 50, "Use 0 to 50"),
  notes: optionalText(2000),
});

export type SleepInput = z.input<typeof sleepSchema>;

export async function saveSleep(id: string | null, input: SleepInput): Promise<ActionResult> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid night." };
  const parsed = sleepSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  if (v.bed === v.wake) return { ok: false, error: "Bedtime and wake time are the same.", fieldErrors: { wake: ["Can't be the same as bedtime."] } };
  const { bedtime, wakeTime } = sleepInstants(v.wakeDate, v.bed, v.wake, ctx.viewer.profile.timezone);
  if (wakeTime.getTime() > Date.now() + 60_000) return { ok: false, error: "That wake time hasn't happened yet.", fieldErrors: { wake: ["That's in the future."] } };
  const row = { sleep_date: v.wakeDate, bedtime: bedtime.toISOString(), wake_time: wakeTime.toISOString(), quality: v.quality, awakenings: v.awakenings, notes: v.notes };
  const { error } = id
    ? await ctx.supabase.from("sleep_logs").update(row).eq("id", id)
    : await ctx.supabase.from("sleep_logs").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You've already logged that night. Edit it instead.", fieldErrors: { wakeDate: ["Already logged."] } };
    return { ok: false, error: "Couldn't save the night." };
  }
  refresh();
  return { ok: true, message: "Sleep logged." };
}

export async function deleteSleep(id: string): Promise<ActionResult> {
  return remove("sleep_logs", id, "night", { column: "sleep_date", action: "sleep.deleted" });
}
