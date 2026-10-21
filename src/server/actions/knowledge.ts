"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { extractWikilinks, parseTags, resolveTitles, titleKey } from "@/features/knowledge/wikilinks";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";
import { invalid, isUuid, optionalText, optionalUrl, optionalUuid } from "./validation";

type Ctx = NonNullable<Awaited<ReturnType<typeof liveContext>>>;

const noteSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title").max(300),
  body: z.string().max(100000).default(""),
  kind: z.enum(["note", "idea", "meeting", "learning", "decision", "reference", "record"]).default("note"),
  folder: optionalText(120),
  url: optionalUrl,
  pinned: z.boolean().default(false),
  goalId: optionalUuid,
  projectId: optionalUuid,
  tags: z.string().max(1000).default(""),
});

export type NoteInput = z.input<typeof noteSchema>;

function refresh() {
  revalidatePath("/knowledge");
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Replaces a note's tags, creating any tag names that don't exist yet. */
async function syncTags(ctx: Ctx, noteId: string, names: string[]) {
  const { error: delErr } = await ctx.supabase.from("note_tags").delete().eq("note_id", noteId);
  if (delErr) throw delErr;
  if (!names.length) return;
  const { data: existing, error } = await ctx.supabase.from("tags").select("id, name");
  if (error) throw error;
  const byKey = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  const missing = names.filter((n) => !byKey.has(n.toLowerCase()));
  if (missing.length) {
    const { data: made, error: insErr } = await ctx.supabase.from("tags").insert(missing.map((name) => ({ name, user_id: ctx.viewer.userId }))).select("id, name");
    if (insErr) throw insErr;
    for (const t of made ?? []) byKey.set(t.name.toLowerCase(), t.id);
  }
  const rows = names.map((n) => ({ note_id: noteId, tag_id: byKey.get(n.toLowerCase())!, user_id: ctx.viewer.userId }));
  const { error: linkErr } = await ctx.supabase.from("note_tags").insert(rows);
  if (linkErr) throw linkErr;
}

/**
 * Keeps record_links in step with `[[Title]]` text: links out of this note,
 * and links into it from notes that mention its (possibly new) title.
 */
async function syncLinks(ctx: Ctx, noteId: string, title: string, body: string) {
  const { data: index, error } = await ctx.supabase.from("notes").select("id, title").is("archived_at", null).order("updated_at", { ascending: false }).limit(5000);
  if (error) throw error;
  const { resolved } = resolveTitles(extractWikilinks(body), index ?? [], noteId);

  const { data: mentioning, error: mErr } = await ctx.supabase.from("notes").select("id, body").neq("id", noteId).ilike("body", `%[[%${likeEscape(title.trim())}%]]%`).limit(1000);
  if (mErr) throw mErr;
  const incoming = (mentioning ?? []).filter((n) => extractWikilinks(n.body).some((t) => titleKey(t) === titleKey(title))).map((n) => n.id);

  const del = await ctx.supabase.from("record_links").delete().eq("from_type", "note").eq("to_type", "note").or(`from_id.eq.${noteId},to_id.eq.${noteId}`);
  if (del.error) throw del.error;
  const base = { user_id: ctx.viewer.userId, from_type: "note", to_type: "note" } as const;
  const rows = [...resolved.map((to) => ({ ...base, from_id: noteId, to_id: to })), ...incoming.map((from) => ({ ...base, from_id: from, to_id: noteId }))];
  if (rows.length) {
    const { error: insErr } = await ctx.supabase.from("record_links").upsert(rows, { onConflict: "user_id,from_type,from_id,to_type,to_id", ignoreDuplicates: true });
    if (insErr) throw insErr;
  }
}

export async function saveNote(id: string | null, input: NoteInput): Promise<ActionResult<{ id: string }>> {
  if (id !== null && !isUuid(id)) return { ok: false, error: "Invalid note." };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const v = parsed.data;
  const row = { title: v.title, body: v.body, kind: v.kind, folder: v.folder, url: v.url, pinned: v.pinned, goal_id: v.goalId, project_id: v.projectId };

  let noteId = id;
  if (id) {
    const { data, error } = await ctx.supabase.from("notes").update(row).eq("id", id).select("id");
    if (error) return { ok: false, error: "Couldn't save the note." };
    if (!data?.length) return { ok: false, error: "Note not found." };
  } else {
    const { data, error } = await ctx.supabase.from("notes").insert({ ...row, user_id: ctx.viewer.userId, source: "manual" }).select("id").single();
    if (error) return { ok: false, error: "Couldn't save the note." };
    noteId = data.id;
  }
  try {
    await syncTags(ctx, noteId!, parseTags(v.tags));
    await syncLinks(ctx, noteId!, v.title, v.body);
  } catch {
    refresh();
    return { ok: false, error: "The note was saved, but its tags or links couldn't be updated. Save again to retry." };
  }
  refresh();
  return { ok: true, data: { id: noteId! }, message: id ? "Saved." : "Note added." };
}

export async function setNotePinned(id: string, pinned: boolean): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid note." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("notes").update({ pinned }).eq("id", id).select("id");
  if (error) return { ok: false, error: "Couldn't update the note." };
  if (!data?.length) return { ok: false, error: "Note not found." };
  refresh();
  return { ok: true, message: pinned ? "Pinned." : "Unpinned." };
}

/** Deleting removes the note, its tags and its links (the database trigger clears record_links). */
export async function deleteNote(id: string): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid note." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { data, error } = await ctx.supabase.from("notes").delete().eq("id", id).select("id, title");
  if (error) return { ok: false, error: "Couldn't delete the note." };
  if (!data?.length) return { ok: false, error: "Note not found." };
  await audit(ctx, "note.deleted", { type: "note", id }, { title: data[0].title });
  refresh();
  return { ok: true, message: "Note deleted." };
}
