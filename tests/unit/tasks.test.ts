import { describe, expect, it } from "vitest";
import { applyFilters, filtersToSearch, isTaskOverdue, parseFilters, viewCounts } from "@/features/tasks/filters";
import type { TaskRecord } from "@/features/tasks/types";

const tz = "Africa/Addis_Ababa";
const now = new Date("2026-10-21T09:00:00Z"); // 12:00 in Addis
let n = 0;
const task = (p: Partial<TaskRecord>): TaskRecord => ({
  id: `t${++n}`, title: "Task", notes: null, status: "todo", priority: 3, area: "personal", due_date: null, due_at: null, is_top_priority: false,
  completed_at: null, project_id: null, goal_id: null, parent_task_id: null, recurrence_rule: null, recurrence_tz: null, estimate_minutes: null,
  series_id: null, created_at: now.toISOString(), updated_at: now.toISOString(), source: "manual", tags: [], dependsOn: [], ...p,
});

describe("task filters", () => {
  const today = task({ title: "Pay rent", due_date: "2026-10-21" });
  const late = task({ title: "Send invoice", due_date: "2026-10-19", priority: 1 });
  const earlierToday = task({ title: "Call bank", due_at: "2026-10-21T07:00:00Z" }); // 10:00 local, already past
  const next = task({ title: "Dentist", due_date: "2026-10-25", area: "health" });
  const far = task({ title: "Renew passport", due_date: "2027-01-10" });
  const undated = task({ title: "Learn Rust", tags: [{ id: "g1", name: "fun" }] });
  const focus = task({ title: "Logo concepts", is_top_priority: true });
  const done = task({ title: "Old", status: "done", completed_at: now.toISOString() });
  const sub = task({ title: "Sub of rent", parent_task_id: today.id, due_date: "2026-10-21" });
  const all = [today, late, earlierToday, next, far, undated, focus, done, sub];
  const titles = (v: TaskRecord[]) => v.map((t) => t.title).sort();

  it("today = due today or earlier, plus focus; subtasks stay under their parent", () => {
    expect(titles(applyFilters(all, { view: "today" }, now, tz))).toEqual(["Call bank", "Logo concepts", "Pay rent", "Send invoice"]);
  });

  it("timed tasks are overdue once their time passes; dated ones after the day", () => {
    expect(isTaskOverdue(earlierToday, now, tz)).toBe(true);
    expect(isTaskOverdue(today, now, tz)).toBe(false);
    expect(titles(applyFilters(all, { view: "overdue" }, now, tz))).toEqual(["Call bank", "Send invoice"]);
  });

  it("upcoming covers the next 14 days only", () => {
    expect(titles(applyFilters(all, { view: "upcoming" }, now, tz))).toEqual(["Dentist"]);
  });

  it("combines search, priority, area and tag", () => {
    expect(titles(applyFilters(all, { view: "all", q: "rent" }, now, tz))).toEqual(["Pay rent", "Sub of rent"]);
    expect(titles(applyFilters(all, { view: "all", priority: 1 }, now, tz))).toEqual(["Send invoice"]);
    expect(titles(applyFilters(all, { view: "all", area: "health" }, now, tz))).toEqual(["Dentist"]);
    expect(titles(applyFilters(all, { view: "nodate", tag: "g1" }, now, tz))).toEqual(["Learn Rust"]);
    expect(titles(applyFilters(all, { view: "done" }, now, tz))).toEqual(["Old"]);
  });

  it("counts match the views", () => {
    const c = viewCounts(all, now, tz);
    expect(c.overdue).toBe(2);
    expect(c.all).toBe(7);
    expect(c.done).toBe(0); // no badge on Completed
  });

  it("URL round-trip ignores junk", () => {
    const f = parseFilters({ view: "upcoming", priority: "2", q: "x", area: "work" });
    expect(parseFilters(Object.fromEntries(new URLSearchParams(filtersToSearch(f))))).toEqual(f);
    expect(parseFilters({ view: "nope", priority: "9" })).toEqual({ view: "today", q: undefined, priority: undefined, area: undefined, tag: undefined, project: undefined });
  });
});
