import "server-only";
import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ImportantDate, Interaction, Person, RelationshipsWorkspace } from "@/features/relationships/types";
import { getViewer } from "./viewer";

/** People's notes are private; they're only read for their owner (RLS). */
export async function getRelationshipsWorkspace(now = new Date()): Promise<RelationshipsWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, timezone, viewer.profile.baseCurrency);
    // Mirrors the database trigger that keeps last_contacted_on current.
    const last = (pid: string) => s.interactions.filter((i) => i.person_id === pid).map((i) => i.occurred_on).sort().at(-1) ?? null;
    return {
      people: s.people.map((p) => ({ ...p, last_contacted_on: last(p.id) })) as Person[],
      interactions: [...s.interactions].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)) as Interaction[],
      dates: s.important_dates as ImportantDate[],
      today, locale, demo: true,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [people, interactions, dates] = await Promise.all([
    supabase.from("people").select("id, name, relationship, birthday, notes, contact_every_days, last_contacted_on, source").is("archived_at", null).order("name"),
    supabase.from("interactions").select("id, person_id, occurred_on, kind, note, source").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    supabase.from("important_dates").select("id, person_id, kind, title, date, recurs_yearly, remind_days_before, source").order("date"),
  ]);
  for (const r of [people, interactions, dates]) if (r.error) throw new Error(`Could not load relationships: ${r.error.message}`);
  return { people: (people.data ?? []) as Person[], interactions: (interactions.data ?? []) as Interaction[], dates: (dates.data ?? []) as ImportantDate[], today, locale, demo: false };
}
