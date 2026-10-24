import { formatMinutes } from "@/features/health/metrics";
import type { Measured } from "@/features/reports/compute";
import type { WeekItem, WeekView } from "./compute";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * "This week so far" on Today, built from the weekly report so the counts
 * match Reports exactly. Areas never tracked are left out rather than shown
 * as zero; a tracked area with nothing yet this week shows 0.
 */
export function weekView(m: Measured, end: string): WeekView {
  const t = m.tracked;
  const items: WeekItem[] = [];
  items.push({ key: "tasks", label: "Tasks done", value: String(m.tasks.completed), hint: m.tasks.late ? `${m.tasks.late} after the due date` : undefined, href: "/tasks" });
  if (m.habits.scheduled) items.push({ key: "habits", label: "Habits kept", value: `${m.habits.rate}%`, hint: `${m.habits.kept} of ${m.habits.scheduled} days`, href: "/habits" });
  if (m.focus.minutes) items.push({ key: "focus", label: "Focus time", value: formatMinutes(m.focus.minutes), href: "/work" });
  if (m.work.projectsCompleted.length) items.push({ key: "projects", label: "Projects finished", value: String(m.work.projectsCompleted.length), hint: m.work.projectsCompleted.slice(0, 2).join(", "), href: "/work" });
  if (t.workouts) items.push({ key: "workouts", label: "Workouts", value: String(m.health.workouts), hint: m.health.workoutMinutes ? formatMinutes(m.health.workoutMinutes) : undefined, href: "/health" });
  if (t.study) items.push({ key: "study", label: "Study", value: m.learning.minutes ? formatMinutes(m.learning.minutes) : "0", hint: m.learning.sessions ? plural(m.learning.sessions, "session") : undefined, href: "/learning?tab=sessions" });
  if (t.meditation) items.push({ key: "meditation", label: "Meditation", value: m.reflection.meditationMinutes ? formatMinutes(m.reflection.meditationMinutes) : "0", hint: m.reflection.meditationDays ? plural(m.reflection.meditationDays, "day") : undefined, href: "/reflection?tab=meditation" });
  if (t.reading) items.push({ key: "reading", label: "Pages read", value: String(m.reflection.pages), hint: m.reflection.readingMinutes ? formatMinutes(m.reflection.readingMinutes) : undefined, href: "/reflection?tab=reading" });
  if (t.journal) items.push({ key: "journal", label: "Days journaled", value: String(m.life.journalDays), href: "/reflection" });
  return { start: m.start, end, days: m.days, daysWithData: m.daysWithData, items };
}
