"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { MODULES } from "@/lib/modules";
import { generateSampleSet } from "@/lib/sample-data";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

const profileSchema = z.object({
  displayName: z.string().trim().max(80).optional().default(""),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  baseCurrency: z.enum(["ETB", "USD", "CAD", "EUR", "GBP", "KES", "AED"]),
  locale: z.enum(["en-US", "en-CA", "en-GB", "am-ET"]),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
});

export type ProfileInput = z.input<typeof profileSchema>;

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ display_name: v.displayName || null, timezone: v.timezone, base_currency: v.baseCurrency, locale: v.locale, week_starts_on: v.weekStartsOn })
    .eq("id", ctx.viewer.userId);
  if (error) return { ok: false, error: "Couldn't save your preferences." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferences saved." };
}

const moduleKeys = MODULES.filter((m) => !m.required).map((m) => m.key) as [string, ...string[]];

export async function setModuleEnabled(moduleKey: string, enabled: boolean): Promise<ActionResult> {
  const parsed = z.enum(moduleKeys).safeParse(moduleKey);
  if (!parsed.success) return { ok: false, error: "This module can't be hidden." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase
    .from("module_settings")
    .upsert({ user_id: ctx.viewer.userId, module_key: parsed.data, enabled }, { onConflict: "user_id,module_key" });
  if (error) return { ok: false, error: "Couldn't update module visibility." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Inserts the sample set for the current user, tagged source = 'sample'.
 * Refuses if sample data is already present so it can't be duplicated.
 */
export async function loadSampleData(): Promise<ActionResult<{ rows: number }>> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { supabase, viewer } = ctx;

  const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("source", "sample");
  if (count) return { ok: false, error: "Sample data is already loaded. Remove it first to reload." };

  const s = generateSampleSet(new Date(), viewer.profile.timezone, viewer.profile.baseCurrency);
  const uid = viewer.userId;
  const withUser = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, user_id: uid }));

  // Insert in foreign-key order. Each batch is validated by the same
  // constraints and RLS policies as hand-entered data.
  const steps: [string, object[]][] = [
    ["wheel_categories", withUser(s.wheel_categories)],
    ["wheel_assessments", withUser(s.wheel_assessments)],
    ["wheel_ratings", withUser(s.wheel_ratings)],
    ["goals", withUser(s.goals.filter((g) => !g.parent_id))],
    ["goals", withUser(s.goals.filter((g) => g.parent_id))],
    ["projects", withUser(s.projects)],
    ["tasks", withUser(s.tasks)],
    ["calendar_events", withUser(s.calendar_events)],
    ["reminders", withUser(s.reminders)],
    ["habits", withUser(s.habits)],
    ["habit_logs", withUser(s.habit_logs)],
    ["financial_accounts", withUser(s.financial_accounts)],
    ["transaction_categories", withUser(s.transaction_categories)],
    ["transactions", withUser(s.transactions)],
    ["budgets", withUser(s.budgets)],
    ["budget_lines", withUser(s.budget_lines)],
    ["wellness_logs", withUser(s.wellness_logs)],
    ["sleep_logs", withUser(s.sleep_logs.map(({ duration_minutes: _d, ...r }) => r))],
    ["journal_entries", withUser(s.journal_entries)],
    ["notes", withUser(s.notes.map(({ updated_at: _u, ...r }) => r))],
    ["daily_reviews", withUser(s.daily_reviews)],
  ];

  let rows = 0;
  for (const [table, data] of steps) {
    if (!data.length) continue;
    const { error } = await supabase.from(table).insert(data);
    if (error) {
      // Roll back whatever was inserted so far.
      await supabase.rpc("purge_sample_data");
      return { ok: false, error: `Couldn't load sample data (${table}): ${error.message}` };
    }
    rows += data.length;
  }
  await audit(ctx, "sample_data.loaded", undefined, { rows });
  revalidatePath("/", "layout");
  return { ok: true, data: { rows }, message: `Loaded ${rows} sample records. Each is labelled “Sample”.` };
}

export async function purgeSampleData(): Promise<ActionResult<{ rows: number }>> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.rpc("purge_sample_data");
  if (error) return { ok: false, error: "Couldn't remove sample data." };
  revalidatePath("/", "layout");
  return { ok: true, data: { rows: data as number }, message: `Removed ${data} sample records. Your own data was not touched.` };
}
