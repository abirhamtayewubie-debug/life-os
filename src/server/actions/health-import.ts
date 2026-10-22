"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rangeFor } from "@/features/health/metrics";
import { HEALTH_BATCH } from "@/lib/apple-health";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

/*
 * Apple Health rows, read from export.xml in the browser and checked again
 * here. Readings recorded by a device are stored as "device"; ones typed into
 * the Health app by hand are stored as "imported", so neither is presented as
 * something it isn't. Re-importing the same export adds nothing twice.
 */

const DEVICE_NAME = "Apple Health";

const iso = z.iso.datetime({ offset: true });
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const measurement = z.object({
  metric: z.enum(["weight", "body_fat_pct", "resting_hr"]),
  measuredAt: iso,
  value: z.number().finite(),
  unit: z.string().max(12),
  typedIn: z.boolean(),
}).refine((m) => { const r = rangeFor(m.metric, m.unit); return !!r && m.value >= r[0] && m.value <= r[1]; });

const night = z.object({
  sleepDate: dateKey,
  bedtime: iso,
  wakeTime: iso,
  awakenings: z.number().int().min(0).max(50).nullable(),
  typedIn: z.boolean(),
}).refine((n) => { const d = new Date(n.wakeTime).getTime() - new Date(n.bedtime).getTime(); return d > 0 && d < 24 * 3600_000; });

const workout = z.object({
  externalId: z.string().min(1).max(300),
  activity: z.string().trim().min(1).max(80),
  performedOn: dateKey,
  startedAt: iso,
  durationMinutes: z.number().int().min(1).max(1440),
  notes: z.string().max(2000).nullable(),
  typedIn: z.boolean(),
});

const batchSchema = z.object({
  measurements: z.array(measurement).max(HEALTH_BATCH).default([]),
  nights: z.array(night).max(HEALTH_BATCH).default([]),
  workouts: z.array(workout).max(HEALTH_BATCH).default([]),
}).refine((b) => b.measurements.length + b.nights.length + b.workouts.length <= HEALTH_BATCH);

export type HealthBatch = z.input<typeof batchSchema>;
export type HealthImportCounts = { measurements: number; nights: number; workouts: number };

export async function importHealthBatch(input: HealthBatch): Promise<ActionResult<HealthImportCounts>> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some rows from the export couldn't be read. Nothing from this part was added." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const userId = ctx.viewer.userId;
  const now = Date.now() + 60_000;
  const { measurements, nights, workouts } = parsed.data;
  const added: HealthImportCounts = { measurements: 0, nights: 0, workouts: 0 };

  if (measurements.length) {
    const rows = measurements.filter((m) => new Date(m.measuredAt).getTime() <= now).map((m) => ({
      user_id: userId, metric: m.metric, measured_at: m.measuredAt, value: m.value, unit: m.unit, source: m.typedIn ? ("imported" as const) : ("device" as const),
    }));
    const { data, error } = await ctx.supabase.from("body_measurements").upsert(rows, { onConflict: "user_id,metric,measured_at,source", ignoreDuplicates: true }).select("id");
    if (error) return { ok: false, error: "Couldn't save the body measurements." };
    added.measurements = data.length;
  }
  if (nights.length) {
    const rows = nights.filter((n) => new Date(n.wakeTime).getTime() <= now).map((n) => ({
      user_id: userId, sleep_date: n.sleepDate, bedtime: n.bedtime, wake_time: n.wakeTime, awakenings: n.awakenings,
      source: n.typedIn ? ("imported" as const) : ("device" as const), device_name: n.typedIn ? null : DEVICE_NAME,
    }));
    const { data, error } = await ctx.supabase.from("sleep_logs").upsert(rows, { onConflict: "user_id,sleep_date,source", ignoreDuplicates: true }).select("id");
    if (error) return { ok: false, error: "Couldn't save the sleep nights." };
    added.nights = data.length;
  }
  if (workouts.length) {
    const rows = workouts.filter((w) => new Date(w.startedAt).getTime() <= now).map((w) => ({
      user_id: userId, external_id: w.externalId, activity: w.activity, performed_on: w.performedOn, started_at: w.startedAt,
      duration_minutes: w.durationMinutes, notes: w.notes, source: w.typedIn ? ("imported" as const) : ("device" as const),
    }));
    const { data, error } = await ctx.supabase.from("workouts").upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) return { ok: false, error: "Couldn't save the workouts." };
    added.workouts = data.length;
  }

  await audit(ctx, "health.import_apple", undefined, { ...added, received: measurements.length + nights.length + workouts.length });
  revalidatePath("/health");
  revalidatePath("/sleep");
  revalidatePath("/");
  return { ok: true, data: added };
}
