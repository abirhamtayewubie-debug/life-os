import type { DataSource } from "@/features/dashboard/types";
import { localDateKey } from "@/lib/dates";
import type { CalendarEventRow, CalendarView, Occurrence } from "@/lib/calendar";

export type CalendarEvent = CalendarEventRow & {
  description: string | null;
  timezone: string | null;
  recurrence_rule: string | null;
  task_id: string | null;
  external_provider: string | null;
  source: DataSource;
};

export type CalendarTask = {
  id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  priority: number;
  estimate_minutes: number | null;
  status: string;
  /** Project dates shown alongside tasks; plain tasks leave these out. */
  kind?: "task" | "milestone" | "project_due";
  /** Where the chip links; tasks open in Tasks & Reminders. */
  href?: string;
};

export const taskHref = (t: Pick<CalendarTask, "id" | "href">) => t.href ?? `/tasks?view=all&open=${t.id}`;

export type CalendarData = {
  view: CalendarView;
  date: string;
  today: string;
  from: string;
  to: string;
  days: string[];
  occurrences: Occurrence<CalendarEvent>[];
  tasks: CalendarTask[];
  blockTask: CalendarTask | null;
  timezone: string;
  locale: string;
  demo: boolean;
};

export const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  event: "Event",
  meeting: "Meeting",
  appointment: "Appointment",
  time_block: "Time block",
  reminder_only: "Reminder",
};

export function taskDayKey(t: Pick<CalendarTask, "due_date" | "due_at">, tz: string) {
  return t.due_date ?? (t.due_at ? localDateKey(new Date(t.due_at), tz) : null);
}
