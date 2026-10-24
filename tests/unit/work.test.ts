import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/features/dashboard/compute";
import type { RawLifeData, RawTask, ViewerProfile } from "@/features/dashboard/types";
import { boardOrder, projectDeadlines, statusCounts, subtaskCounts, taskDueKey } from "@/features/work/stats";
import { BOARD_COLUMNS, type ProjectRecord, type ProjectTask } from "@/features/work/types";

const task = (o: Partial<ProjectTask>): ProjectTask => ({
  id: crypto.randomUUID(), title: "t", notes: null, status: "todo", priority: 3, area: "work", due_date: null, due_at: null,
  is_top_priority: false, completed_at: null, project_id: "p", goal_id: null, parent_task_id: null, recurrence_rule: null,
  recurrence_tz: null, estimate_minutes: null, series_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  source: "manual", tags: [], dependsOn: [], ...o,
});
const project = (o: Partial<ProjectRecord>): ProjectRecord => ({
  id: "p", goal_id: null, name: "Site report", description: null, status: "active", area: "work", start_date: null, due_date: null,
  budget_amount: null, budget_currency: null, source: "manual", ...o,
});

describe("project board", () => {
  it("has To do, Doing, Blocked and Done columns on the existing task statuses", () => {
    expect(BOARD_COLUMNS.map((c) => [c.status, c.label])).toEqual([["todo", "To do"], ["in_progress", "Doing"], ["waiting", "Blocked"], ["done", "Done"]]);
  });

  it("counts top-level tasks per column, for one project or all", () => {
    const tasks = [task({ status: "waiting" }), task({ status: "done" }), task({ status: "todo", parent_task_id: "x" }), task({ project_id: "q", status: "in_progress" })];
    expect(statusCounts(tasks, "p")).toMatchObject({ todo: 0, in_progress: 0, waiting: 1, done: 1 });
    expect(statusCounts(tasks, null)).toMatchObject({ in_progress: 1, waiting: 1, done: 1, todo: 0 });
  });

  it("counts subtasks per parent, leaving cancelled ones out", () => {
    const m = subtaskCounts([task({ parent_task_id: "a", status: "done" }), task({ parent_task_id: "a" }), task({ parent_task_id: "a", status: "cancelled" })]);
    expect(m.get("a")).toEqual({ done: 1, total: 2 });
  });

  it("orders cards by priority, then deadline; done by most recent", () => {
    const a = task({ priority: 2, due_date: "2026-10-30" });
    const b = task({ priority: 1 });
    const c = task({ priority: 2, due_date: "2026-10-25" });
    expect([a, b, c].sort((x, y) => boardOrder(x, y, "UTC")).map((t) => t.id)).toEqual([b.id, c.id, a.id]);
    const d1 = task({ status: "done", completed_at: "2026-10-01T00:00:00Z" });
    const d2 = task({ status: "done", completed_at: "2026-10-05T00:00:00Z" });
    expect([d1, d2].sort((x, y) => boardOrder(x, y, "UTC"))[0].id).toBe(d2.id);
  });

  it("uses the local day of a timed deadline", () => {
    expect(taskDueKey({ due_date: null, due_at: "2026-10-24T22:30:00Z" }, "Africa/Addis_Ababa")).toBe("2026-10-25");
  });
});

describe("project calendar", () => {
  it("lists task deadlines, milestones, starts and due dates in range, without subtasks or cancelled work", () => {
    const ws = {
      projects: [project({ start_date: "2026-10-02", due_date: "2026-10-28" }), project({ id: "gone", status: "cancelled", due_date: "2026-10-10" })],
      tasks: [
        task({ title: "Draft", due_date: "2026-10-20" }),
        task({ title: "Sub", due_date: "2026-10-20", parent_task_id: "x" }),
        task({ title: "Dropped", due_date: "2026-10-21", status: "cancelled" }),
        task({ title: "Later", due_date: "2026-12-01" }),
      ],
      milestones: [{ id: "m", project_id: "p", goal_id: null, title: "Survey done", due_date: "2026-10-15", completed_at: "2026-10-14T00:00:00Z", sort_order: 0, source: "manual" as const }],
    };
    const out = projectDeadlines(ws, "2026-10-01", "2026-10-31", "UTC", null);
    expect(out.map((d) => [d.date, d.kind, d.title, d.done])).toEqual([
      ["2026-10-02", "start", "Site report starts", false],
      ["2026-10-15", "milestone", "Survey done", true],
      ["2026-10-20", "task", "Draft", false],
      ["2026-10-28", "due", "Site report due", false],
    ]);
    expect(projectDeadlines(ws, "2026-10-01", "2026-10-31", "UTC", "other")).toEqual([]);
  });
});

describe("Today: projects", () => {
  const profile: ViewerProfile = { displayName: null, timezone: "UTC", locale: "en-US", baseCurrency: "ETB", measurementSystem: "metric" };
  const raw = (o: Partial<RawTask>): RawTask => ({
    id: crypto.randomUUID(), title: "t", status: "todo", priority: 3, area: "work", due_date: null, due_at: null, is_top_priority: false,
    completed_at: null, project_id: "p", goal_id: null, created_at: "2026-09-01T00:00:00Z", source: "manual", ...o,
  });
  const data: RawLifeData = {
    tasks: [raw({ status: "waiting" }), raw({ due_date: "2026-10-20" }), raw({ status: "done", completed_at: "2026-10-20T10:00:00Z" })],
    events: [], reminders: [], habits: [], habitLogs: [], goals: [],
    projects: [{ id: "p", name: "Site report", status: "active", area: "work", due_date: null, source: "manual" }],
    milestones: [
      { id: "m2", project_id: "p", title: "Final", due_date: "2026-11-20", completed_at: null },
      { id: "m1", project_id: "p", title: "Draft to engineer", due_date: "2026-10-28", completed_at: null },
      { id: "m0", project_id: "p", title: "Survey", due_date: "2026-10-10", completed_at: "2026-10-10T00:00:00Z" },
    ],
    accounts: [], categories: [], budgets: [], transactions: [], wellness: [], sleep: [], wheelCategories: [], wheelAssessments: [], journal: [], notes: [], reviews: [],
  };

  it("shows blocked and overdue counts and the next open milestone", () => {
    const m = buildDashboard(data, new Date("2026-10-24T09:00:00Z"), profile);
    expect(m.projects[0]).toMatchObject({ blocked: 1, overdue: 1, nextMilestone: { title: "Draft to engineer", dueDate: "2026-10-28" } });
    expect(m.suggestions.some((s) => s.id === "projects-blocked")).toBe(true);
  });

  it("invents no milestone when none are recorded", () => {
    const m = buildDashboard({ ...data, milestones: undefined }, new Date("2026-10-24T09:00:00Z"), profile);
    expect(m.projects[0].nextMilestone).toBeNull();
  });
});
