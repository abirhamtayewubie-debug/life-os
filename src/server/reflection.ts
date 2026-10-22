import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JournalEntry, PersonalValue, ReflectionWorkspace } from "@/features/reflection/types";
import { getViewer } from "./viewer";

const COLUMNS = "id, entry_date, kind, title, body, mood, is_private, ai_access_allowed, source, updated_at";

/** Journal entries are only ever read for the signed-in owner (RLS) and never leave the server except to them. */
export async function getReflectionWorkspace(query: string | null, now = new Date()): Promise<ReflectionWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);
  const q = query?.trim().slice(0, 100) || null;

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    const entries = s.journal_entries.map((e) => ({ ...e, mood: null, ai_access_allowed: false, updated_at: e.entry_date })) as JournalEntry[];
    return {
      entries: q ? entries.filter((e) => `${e.title ?? ""} ${e.body}`.toLowerCase().includes(q.toLowerCase())) : entries,
      values: s.personal_values as PersonalValue[],
      query: q, today, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  let entriesQ = supabase.from("journal_entries").select(COLUMNS).is("archived_at", null);
  if (q) entriesQ = entriesQ.textSearch("search", q, { type: "websearch", config: "simple" });
  const [entries, values] = await Promise.all([
    entriesQ.order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(q ? 100 : 400),
    supabase.from("personal_values").select("id, name, description, sort_order, source").order("sort_order"),
  ]);
  for (const r of [entries, values]) if (r.error) throw new Error(`Could not load the journal: ${r.error.message}`);
  return { entries: (entries.data ?? []) as JournalEntry[], values: (values.data ?? []) as PersonalValue[], query: q, today, locale, demo: false };
}
