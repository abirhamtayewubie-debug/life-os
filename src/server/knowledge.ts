import "server-only";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { KnowledgeWorkspace, NoteLink, NoteRecord } from "@/features/knowledge/types";
import { getViewer } from "./viewer";

const COLUMNS = "id, title, body, kind, folder, url, pinned, project_id, goal_id, source, updated_at, note_tags(tags(name))";

type Row = Omit<NoteRecord, "tags"> & { note_tags: { tags: { name: string } | null }[] | null };

export async function getKnowledgeWorkspace(query: string | null, now = new Date()): Promise<KnowledgeWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const q = query?.trim().slice(0, 100) || null;

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    const all = s.notes.map((n) => ({ ...n, tags: [] })) as NoteRecord[];
    const notes = q ? all.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())) : all;
    return {
      notes, index: all.map(({ id, title }) => ({ id, title })), links: s.note_links.map(({ from_id, to_id }) => ({ from_id, to_id })),
      tags: [], goals: s.goals.map(({ id, title }) => ({ id, title })), projects: s.projects.map(({ id, name }) => ({ id, name })),
      query: q, locale, timezone, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  let notesQ = supabase.from("notes").select(COLUMNS).is("archived_at", null);
  if (q) notesQ = notesQ.textSearch("search", q, { type: "websearch", config: "simple" });
  const [notes, index, links, tags, goals, projects] = await Promise.all([
    notesQ.order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(q ? 100 : 500),
    supabase.from("notes").select("id, title").is("archived_at", null).order("updated_at", { ascending: false }).limit(5000),
    supabase.from("record_links").select("from_id, to_id").eq("from_type", "note").eq("to_type", "note").limit(10000),
    supabase.from("tags").select("name").order("name"),
    supabase.from("goals").select("id, title").in("status", ["active", "paused"]).order("title"),
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
  ]);
  for (const r of [notes, index, links, tags, goals, projects]) if (r.error) throw new Error(`Could not load notes: ${r.error.message}`);

  return {
    notes: ((notes.data ?? []) as unknown as Row[]).map(({ note_tags, ...n }) => ({ ...n, tags: (note_tags ?? []).flatMap((t) => (t.tags ? [t.tags.name] : [])).sort() })),
    index: index.data ?? [],
    links: (links.data ?? []) as NoteLink[],
    tags: (tags.data ?? []).map((t) => t.name),
    goals: goals.data ?? [],
    projects: projects.data ?? [],
    query: q, locale, timezone, demo: false,
  };
}
