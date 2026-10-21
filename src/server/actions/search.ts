"use server";

import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "../viewer";

export type SearchHit = { kind: "task" | "event" | "habit"; id: string; title: string; detail: string | null; href: string };

const PER_KIND = 6;

/** Escape LIKE wildcards so user input is matched literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Record search for the command palette: titles of tasks, events and habits.
 * Runs as the signed-in user, so RLS limits results to their own rows.
 */
export async function searchRecords(raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const viewer = await getViewer();
  const tz = viewer.profile.timezone;
  const eventHref = (startsAt: string, allDay: boolean) => `/calendar?view=day&date=${allDay ? startsAt.slice(0, 10) : localDateKey(new Date(startsAt), tz)}`;

  if (viewer.mode === "demo") {
    const s = generateSampleSet(new Date(), tz, viewer.profile.baseCurrency);
    const m = (t: string) => t.toLowerCase().includes(q.toLowerCase());
    return [
      ...s.tasks.filter((t) => m(t.title)).slice(0, PER_KIND).map((t): SearchHit => ({ kind: "task", id: t.id, title: t.title, detail: t.status === "done" ? "Done" : t.due_date, href: `/tasks?view=all&q=${encodeURIComponent(t.title)}` })),
      ...s.calendar_events.filter((e) => m(e.title)).slice(0, PER_KIND).map((e): SearchHit => ({ kind: "event", id: e.id, title: e.title, detail: e.all_day ? e.starts_at.slice(0, 10) : localDateKey(new Date(e.starts_at), tz), href: eventHref(e.starts_at, e.all_day) })),
      ...s.habits.filter((h) => m(h.name)).slice(0, PER_KIND).map((h): SearchHit => ({ kind: "habit", id: h.id, title: h.name, detail: null, href: "/habits" })),
    ];
  }

  const supabase = await createSupabaseServerClient();
  const p = likePattern(q);
  const [tasks, events, habits] = await Promise.all([
    supabase.from("tasks").select("id, title, status, due_date").is("archived_at", null).ilike("title", p).order("updated_at", { ascending: false }).limit(PER_KIND),
    supabase.from("calendar_events").select("id, title, starts_at, all_day").is("archived_at", null).ilike("title", p).order("starts_at", { ascending: false }).limit(PER_KIND),
    supabase.from("habits").select("id, name, archived_at").ilike("name", p).limit(PER_KIND),
  ]);
  return [
    ...(tasks.data ?? []).map((t): SearchHit => ({ kind: "task", id: t.id, title: t.title, detail: t.status === "done" ? "Done" : t.due_date, href: `/tasks?view=${t.status === "done" ? "done" : "all"}&open=${t.id}` })),
    ...(events.data ?? []).map((e): SearchHit => ({ kind: "event", id: e.id, title: e.title, detail: e.all_day ? e.starts_at.slice(0, 10) : localDateKey(new Date(e.starts_at), tz), href: eventHref(e.starts_at, e.all_day) })),
    ...(habits.data ?? []).map((h): SearchHit => ({ kind: "habit", id: h.id, title: h.name, detail: h.archived_at ? "Archived" : null, href: "/habits" })),
  ];
}
