import "server-only";
import { addDays, localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRACTICE_HISTORY_DAYS, REVIEW_HISTORY_DAYS, type JournalEntry, type MeditationLink, type MeditationSession, type PersonalValue, type ReflectionWorkspace, type Review } from "@/features/reflection/types";
import { getViewer } from "./viewer";

const COLUMNS = "id, entry_date, kind, title, body, mood, is_private, ai_access_allowed, source, updated_at";
const REVIEW_COLUMNS = "id, review_date, kind, achievements, unfinished, tomorrow_priorities, mood, energy, notes, source";

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
      meditations: s.meditation_links as MeditationLink[],
      practice: s.meditation_sessions as MeditationSession[],
      reviews: s.demo_reviews as Review[],
      query: q, today, weekStart: 1, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  let entriesQ = supabase.from("journal_entries").select(COLUMNS).is("archived_at", null);
  if (q) entriesQ = entriesQ.textSearch("search", q, { type: "websearch", config: "simple" });
  const [entries, values, meditations, practice, reviews, profile] = await Promise.all([
    entriesQ.order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(q ? 100 : 400),
    supabase.from("personal_values").select("id, name, description, sort_order, source").order("sort_order"),
    supabase.from("meditation_links").select("id, title, url, minutes, category, notes, favourite, archived_at, source").order("favourite", { ascending: false }).order("title"),
    supabase.from("meditation_sessions").select("id, practiced_on, minutes, link_id, notes, source").gte("practiced_on", addDays(today, -PRACTICE_HISTORY_DAYS)).order("practiced_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("daily_reviews").select(REVIEW_COLUMNS).gte("review_date", addDays(today, -REVIEW_HISTORY_DAYS)).order("review_date", { ascending: false }),
    supabase.from("profiles").select("week_starts_on").eq("id", viewer.userId).maybeSingle(),
  ]);
  for (const r of [entries, values, meditations, practice, reviews]) if (r.error) throw new Error(`Could not load Reflection: ${r.error.message}`);
  return {
    entries: (entries.data ?? []) as JournalEntry[],
    values: (values.data ?? []) as PersonalValue[],
    meditations: (meditations.data ?? []) as MeditationLink[],
    practice: (practice.data ?? []) as MeditationSession[],
    reviews: (reviews.data ?? []) as Review[],
    query: q, today, weekStart: profile.data?.week_starts_on ?? 1, locale, demo: false,
  };
}
