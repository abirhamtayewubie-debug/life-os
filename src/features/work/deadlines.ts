import { diffDays } from "@/lib/dates";

/** A project or project-milestone date that's past or coming up. */
export type ProjectDeadline = {
  id: string; kind: "project" | "milestone"; title: string;
  /** The project's name for a milestone; null for the project itself. */
  project: string | null; projectId: string; dueDate: string;
  /** Days from today; negative when past. */
  days: number;
};

/**
 * Project due dates and open milestone dates up to `horizon` days ahead,
 * including any already past. A project with nothing left open isn't a
 * deadline any more, and milestones of projects not in the list are skipped.
 */
export function projectDeadlines(
  projects: { id: string; name: string; due_date: string | null; open: number }[],
  milestones: { id: string; project_id: string | null; title: string; due_date: string | null; completed_at: string | null }[],
  today: string,
  horizon: number,
): ProjectDeadline[] {
  const name = new Map(projects.map((p) => [p.id, p.name]));
  return [
    ...projects.filter((p) => p.due_date && p.open > 0)
      .map((p) => ({ id: p.id, kind: "project" as const, title: p.name, project: null, projectId: p.id, dueDate: p.due_date!, days: diffDays(today, p.due_date!) })),
    ...milestones.filter((m) => !m.completed_at && m.due_date && m.project_id && name.has(m.project_id))
      .map((m) => ({ id: m.id, kind: "milestone" as const, title: m.title, project: name.get(m.project_id!)!, projectId: m.project_id!, dueDate: m.due_date!, days: diffDays(today, m.due_date!) })),
  ].filter((x) => x.days <= horizon).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.kind.localeCompare(a.kind));
}
