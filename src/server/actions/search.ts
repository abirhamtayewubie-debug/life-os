"use server";

import { localDateKey } from "@/lib/dates";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getViewer } from "../viewer";

export type SearchHit = { kind: "task" | "event" | "habit" | "goal" | "project" | "note" | "person"; id: string; title: string; detail: string | null; href: string };

const PER_KIND = 6;

/** Escape LIKE wildcards so user input is matched literally. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Record search for the command palette: titles of tasks, events, habits,
 * goals, projects, notes and people. Journal entries are deliberately left
 * out; they're searched only on the Reflection page.
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
      ...s.goals.filter((g) => m(g.title)).slice(0, PER_KIND).map((g): SearchHit => ({ kind: "goal", id: g.id, title: g.title, detail: "Goal", href: `/goals?open=${g.id}` })),
      ...s.projects.filter((p) => m(p.name)).slice(0, PER_KIND).map((p): SearchHit => ({ kind: "project", id: p.id, title: p.name, detail: "Project", href: `/work?project=${p.id}` })),
      ...s.notes.filter((n) => m(n.title)).slice(0, PER_KIND).map((n): SearchHit => ({ kind: "note", id: n.id, title: n.title, detail: "Note", href: `/knowledge?note=${n.id}` })),
      ...s.people.filter((p) => m(p.name)).slice(0, PER_KIND).map((p): SearchHit => ({ kind: "person", id: p.id, title: p.name, detail: p.relationship, href: "/relationships" })),
    ];
  }

  const supabase = await createSupabaseServerClient();
  const p = likePattern(q);
  const [tasks, events, habits, goals, projects, notes, people] = await Promise.all([
    supabase.from("tasks").select("id, title, status, due_date").is("archived_at", null).ilike("title", p).order("updated_at", { ascending: false }).limit(PER_KIND),
    supabase.from("calendar_events").select("id, title, starts_at, all_day").is("archived_at", null).ilike("title", p).order("starts_at", { ascending: false }).limit(PER_KIND),
    supabase.from("habits").select("id, name, archived_at").ilike("name", p).limit(PER_KIND),
    supabase.from("goals").select("id, title, status").ilike("title", p).limit(PER_KIND),
    supabase.from("projects").select("id, name").is("archived_at", null).ilike("name", p).limit(PER_KIND),
    supabase.from("notes").select("id, title").is("archived_at", null).ilike("title", p).order("updated_at", { ascending: false }).limit(PER_KIND),
    supabase.from("people").select("id, name, relationship").is("archived_at", null).ilike("name", p).limit(PER_KIND),
  ]);
  return [
    ...(tasks.data ?? []).map((t): SearchHit => ({ kind: "task", id: t.id, title: t.title, detail: t.status === "done" ? "Done" : t.due_date, href: `/tasks?view=${t.status === "done" ? "done" : "all"}&open=${t.id}` })),
    ...(events.data ?? []).map((e): SearchHit => ({ kind: "event", id: e.id, title: e.title, detail: e.all_day ? e.starts_at.slice(0, 10) : localDateKey(new Date(e.starts_at), tz), href: eventHref(e.starts_at, e.all_day) })),
    ...(habits.data ?? []).map((h): SearchHit => ({ kind: "habit", id: h.id, title: h.name, detail: h.archived_at ? "Archived" : null, href: "/habits" })),
    ...(goals.data ?? []).map((g): SearchHit => ({ kind: "goal", id: g.id, title: g.title, detail: "Goal", href: `/goals?open=${g.id}` })),
    ...(projects.data ?? []).map((p): SearchHit => ({ kind: "project", id: p.id, title: p.name, detail: "Project", href: `/work?project=${p.id}` })),
    ...(notes.data ?? []).map((n): SearchHit => ({ kind: "note", id: n.id, title: n.title, detail: "Note", href: `/knowledge?note=${n.id}` })),
    ...(people.data ?? []).map((p): SearchHit => ({ kind: "person", id: p.id, title: p.name, detail: p.relationship, href: "/relationships" })),
  ];
}
