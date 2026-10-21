"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getReport } from "../reports";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";
import { dateKey } from "./validation";

const schema = z.object({ period: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]), date: dateKey });

/**
 * Saves this period's facts as they stand now. The numbers are recomputed on
 * the server from the person's own data; nothing from the browser is stored.
 */
export async function saveReportSnapshot(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid report." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const r = await getReport({ period: parsed.data.period, date: parsed.data.date });
  const { error } = await ctx.supabase.from("reports").upsert(
    { user_id: ctx.viewer.userId, period: r.period, period_start: r.start, period_end: r.end, measured: r.current, generated_at: new Date().toISOString(),
      // New numbers make an earlier write-up stale, so it is cleared.
      interpretation: null, interpretation_model: null, interpreted_at: null },
    { onConflict: "user_id,period,period_start" },
  );
  if (error) return { ok: false, error: "Couldn't save the snapshot." };
  revalidatePath("/reports");
  return { ok: true, message: "Snapshot saved. Later edits won't change it until you save again." };
}
