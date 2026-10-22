"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";
import { MAX_IMPORT_EVENTS } from "@/lib/ics";
import { isValidRule, parseRule, serializeRule } from "@/lib/recurrence";
import { siteOrigin } from "@/server/calendar-files";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

/* ------------------------------------------------------------------------ */
/* Private subscribe link                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Creates the private subscribe link, or replaces it (the old link stops
 * working). Only a hash is stored, so the link is shown this once.
 */
export async function createCalendarFeed(): Promise<ActionResult<{ url: string }>> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const token = randomBytes(32).toString("base64url");
  const token_hash = `\\x${createHash("sha256").update(token).digest("hex")}`;
  const { data: existing } = await ctx.supabase.from("calendar_feeds").select("id").maybeSingle();
  // Replace rather than update, so "created" always describes the live link.
  if (existing) await ctx.supabase.from("calendar_feeds").delete().eq("id", existing.id);
  const { error } = await ctx.supabase.from("calendar_feeds").insert({ user_id: ctx.viewer.userId, token_hash });
  if (error) return { ok: false, error: "Couldn't create the link." };
  await audit(ctx, existing ? "calendar.feed_rotated" : "calendar.feed_created");
  revalidatePath("/calendar");
  revalidatePath("/integrations");
  return { ok: true, data: { url: `${await siteOrigin()}/feed/calendar/${token}.ics` }, message: existing ? "New link created. The old one no longer works." : "Link created." };
}

export async function revokeCalendarFeed(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("calendar_feeds").delete().eq("user_id", ctx.viewer.userId);
  if (error) return { ok: false, error: "Couldn't turn the link off." };
  await audit(ctx, "calendar.feed_revoked");
  revalidatePath("/calendar");
  revalidatePath("/integrations");
  return { ok: true, message: "Link turned off. Calendar apps using it will stop updating." };
}

/* ------------------------------------------------------------------------ */
/* Import from an .ics file (parsed in the browser, checked again here)     */
/* ------------------------------------------------------------------------ */

const iso = z.iso.datetime({ offset: true });
const importedEvent = z
  .object({
    uid: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10000).nullable(),
    location: z.string().max(300).nullable(),
    allDay: z.boolean(),
    startsAt: iso,
    endsAt: iso,
    timezone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
    recurrenceRule: z.string().max(200).nullable().refine((r) => r === null || isValidRule(r), "Unsupported repeat rule"),
  })
  .refine((e) => new Date(e.endsAt) >= new Date(e.startsAt), "Ends before it starts")
  .refine((e) => !e.allDay || (e.startsAt.endsWith("T00:00:00.000Z") && e.endsAt.endsWith("T00:00:00.000Z")), "All-day events start at midnight");

const importSchema = z.object({
  fileName: z.string().max(200).default(""),
  events: z.array(importedEvent).min(1, "The file has no events to add.").max(MAX_IMPORT_EVENTS),
});

const PROVIDER = "ics";

/**
 * Adds events from a calendar file. Each keeps its UID, so importing the same
 * file again adds only what's new; events you already have are left as they
 * are, including any edits you made here.
 */
export async function importCalendarEvents(input: z.input<typeof importSchema>): Promise<ActionResult<{ added: number; existing: number }>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message === "The file has no events to add." ? "The file has no events to add." : "Some events in the file couldn't be read. Nothing was added." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;

  const events = [...new Map(parsed.data.events.map((e) => [e.uid, e])).values()];
  const known = new Set<string>();
  for (let i = 0; i < events.length; i += 200) {
    const { data, error } = await ctx.supabase.from("calendar_events").select("external_id")
      .eq("external_provider", PROVIDER).in("external_id", events.slice(i, i + 200).map((e) => e.uid));
    if (error) return { ok: false, error: "Couldn't check for events you already have. Nothing was added." };
    for (const r of data) known.add(r.external_id as string);
  }

  const rows = events.filter((e) => !known.has(e.uid)).map((e) => ({
    user_id: ctx.viewer.userId,
    title: e.title,
    description: e.description,
    location: e.location,
    all_day: e.allDay,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    timezone: e.timezone,
    recurrence_rule: e.recurrenceRule ? serializeRule(parseRule(e.recurrenceRule)) : null,
    kind: "event" as const,
    source: "imported" as const,
    external_provider: PROVIDER,
    external_id: e.uid,
  }));

  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.supabase.from("calendar_events").insert(rows.slice(i, i + 500));
    if (error) {
      if (added) revalidatePath("/calendar");
      return { ok: false, error: added ? `Added ${added} events, then the rest couldn't be saved. Import the file again to add the remainder.` : "Couldn't save the events. Nothing was added." };
    }
    added += Math.min(500, rows.length - i);
  }
  await audit(ctx, "calendar.import_ics", undefined, { added, existing: known.size, file: parsed.data.fileName.slice(0, 120) });
  revalidatePath("/calendar");
  revalidatePath("/");
  const message = added === 0 ? "Nothing new: every event in this file is already in your calendar."
    : `Added ${added} event${added === 1 ? "" : "s"}${known.size ? `; ${known.size} were already here` : ""}.`;
  return { ok: true, data: { added, existing: known.size }, message };
}
