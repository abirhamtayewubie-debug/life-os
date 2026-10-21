import "server-only";
import { addDays, localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { expandEvents, rangeFor, type CalendarView } from "@/lib/calendar";
import { generateSampleSet } from "@/lib/sample-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { taskDayKey, type CalendarData, type CalendarEvent, type CalendarTask } from "@/features/calendar/types";
import { getViewer } from "./viewer";

const EVENT_COLUMNS = "id, title, kind, starts_at, ends_at, all_day, location, description, timezone, recurrence_rule, task_id, external_provider, source";

/**
 * Events (expanded into occurrences) and dated tasks for the visible range.
 * `blockTaskId` loads that task even when it falls outside the range, so
 * "Block time" from a task always has something to schedule.
 */
export async function getCalendarData(view: CalendarView, anchor: string | null, blockTaskId: string | null, now = new Date()): Promise<CalendarData> {
  const viewer = await getViewer();
  const { timezone: tz, locale } = viewer.profile;
  const today = localDateKey(now, tz);
  const date = anchor ?? today;
  const { from, to, days } = rangeFor(view, date);
  const base = { view, date, today, from, to, days, timezone: tz, locale };

  if (viewer.mode === "demo") {
    const s = generateSampleSet(now, tz, viewer.profile.baseCurrency);
    const events: CalendarEvent[] = s.calendar_events.map((e) => ({
      ...e, starts_at: e.all_day ? `${e.starts_at.slice(0, 10)}T00:00:00.000Z` : e.starts_at, ends_at: e.all_day ? `${e.ends_at.slice(0, 10)}T00:00:00.000Z` : e.ends_at,
      description: null, recurrence_rule: null, task_id: null, external_provider: null,
    }));
    const tasks: CalendarTask[] = s.tasks
      .filter((t) => t.status !== "done")
      .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, due_at: t.due_at, priority: t.priority, estimate_minutes: null, status: t.status }));
    const block = blockTaskId ? tasks.find((t) => t.id === blockTaskId) ?? null : null;
    return { ...base, occurrences: expandEvents(events, from, to, tz), tasks: tasks.filter((t) => inRange(t, from, to, tz)), blockTask: block, demo: true };
  }

  const supabase = await createSupabaseServerClient();
  // One day of padding each side catches events that cross midnight.
  const startIso = zonedTimeToUtc(addDays(from, -1), "00:00", tz).toISOString();
  const endIso = zonedTimeToUtc(addDays(to, 2), "00:00", tz).toISOString();
  const [single, recurring, dated, timed, block] = await Promise.all([
    supabase.from("calendar_events").select(EVENT_COLUMNS).is("archived_at", null).is("recurrence_rule", null).lt("starts_at", endIso).gt("ends_at", startIso).order("starts_at").limit(1000),
    supabase.from("calendar_events").select(EVENT_COLUMNS).is("archived_at", null).not("recurrence_rule", "is", null).lt("starts_at", endIso).limit(300),
    supabase.from("tasks").select("id, title, due_date, due_at, priority, estimate_minutes, status").is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]).gte("due_date", from).lte("due_date", to).limit(500),
    supabase.from("tasks").select("id, title, due_date, due_at, priority, estimate_minutes, status").is("archived_at", null).in("status", ["todo", "in_progress", "waiting"]).gte("due_at", startIso).lt("due_at", endIso).limit(500),
    blockTaskId && /^[0-9a-f-]{36}$/i.test(blockTaskId)
      ? supabase.from("tasks").select("id, title, due_date, due_at, priority, estimate_minutes, status").eq("id", blockTaskId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [single, recurring, dated, timed]) if (r.error) throw new Error(`Could not load the calendar: ${r.error.message}`);

  const events = [...(single.data ?? []), ...(recurring.data ?? [])] as CalendarEvent[];
  const taskMap = new Map<string, CalendarTask>();
  for (const t of [...(dated.data ?? []), ...(timed.data ?? [])] as CalendarTask[]) if (inRange(t, from, to, tz)) taskMap.set(t.id, t);

  return {
    ...base,
    occurrences: expandEvents(events, from, to, tz),
    tasks: [...taskMap.values()],
    blockTask: (block.data as CalendarTask | null) ?? null,
    demo: false,
  };
}

function inRange(t: CalendarTask, from: string, to: string, tz: string) {
  const k = taskDayKey(t, tz);
  return !!k && k >= from && k <= to;
}
