import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/features/dashboard/compute";
import type { RawLifeData, RawTask, ViewerProfile } from "@/features/dashboard/types";
import { weekView } from "@/features/dashboard/week";
import { computeReport, type ReportInput } from "@/features/reports/compute";
import { projectDeadlines } from "@/features/work/deadlines";

const TZ = "Africa/Addis_Ababa";
const profile: ViewerProfile = { displayName: null, timezone: TZ, locale: "en-US", baseCurrency: "ETB", measurementSystem: "metric" };
const NOW = new Date("2026-10-21T07:00:00Z"); // Wednesday 10:00 local
const empty: RawLifeData = {
  tasks: [], events: [], reminders: [], habits: [], habitLogs: [], goals: [], projects: [], accounts: [], categories: [],
  budgets: [], transactions: [], wellness: [], sleep: [], wheelCategories: [], wheelAssessments: [], journal: [], notes: [], reviews: [],
};
const task = (o: Partial<RawTask>): RawTask => ({
  id: crypto.randomUUID(), title: "t", status: "todo", priority: 3, area: "work", due_date: null, due_at: null, is_top_priority: false,
  completed_at: null, project_id: null, goal_id: null, created_at: "2026-09-01T00:00:00Z", source: "manual", ...o,
});

describe("project deadlines", () => {
  const projects = [
    { id: "a", name: "Café rebrand", due_date: "2026-10-25", open: 3 },
    { id: "b", name: "Site report", due_date: "2026-10-18", open: 1 },
    { id: "c", name: "Done but not closed", due_date: "2026-10-22", open: 0 },
    { id: "d", name: "Far off", due_date: "2026-12-01", open: 2 },
  ];
  const milestones = [
    { id: "m1", project_id: "a", title: "Logo concepts", due_date: "2026-10-25", completed_at: null },
    { id: "m2", project_id: "a", title: "Moodboard", due_date: "2026-10-20", completed_at: "2026-10-19T10:00:00Z" },
    { id: "m3", project_id: "x", title: "Other project's", due_date: "2026-10-22", completed_at: null },
    { id: "m4", project_id: null, title: "Goal milestone", due_date: "2026-10-22", completed_at: null },
  ];
  it("lists past and upcoming dates, soonest first, project before its milestone", () => {
    const r = projectDeadlines(projects, milestones, "2026-10-21", 14);
    expect(r.map((x) => [x.kind, x.title, x.days])).toEqual([
      ["project", "Site report", -3],
      ["project", "Café rebrand", 4],
      ["milestone", "Logo concepts", 4],
    ]);
    expect(r[2].project).toBe("Café rebrand");
  });
  it("shows on Today and in the briefing", () => {
    const m = buildDashboard({
      ...empty,
      projects: [{ id: "p", name: "Café rebrand", status: "active", area: "work", due_date: "2026-10-23", source: "manual" }],
      tasks: [task({ project_id: "p" })],
      milestones: [{ id: "m", project_id: "p", title: "Logo concepts", due_date: "2026-10-19", completed_at: null }],
    }, NOW, profile);
    expect(m.projectDeadlines.map((x) => x.title)).toEqual(["Logo concepts", "Café rebrand"]);
    expect(m.briefing.lines).toContain("Past a project deadline: Logo concepts (Café rebrand).");
    expect(m.briefing.lines.some((l) => l.startsWith("Project deadline this week: Café rebrand"))).toBe(true);
  });
});

describe("this week on Today", () => {
  const blank: ReportInput = {
    tasksDone: [], habits: [], habitLogs: [], focus: [], workouts: [], sleep: [], wellness: [], hydration: [], money: [],
    journalDates: [], goalsAchieved: [], milestonesDone: [], learningFinished: [], interactions: [],
  };
  it("leaves out areas never tracked and keeps tracked ones at zero", () => {
    const m = computeReport({ ...blank, tasksDone: [{ completed_on: "2026-10-20", due_date: null }], tracked: { meditation: true } }, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    const w = weekView(m, "2026-10-25");
    expect(w.items.map((x) => [x.key, x.value])).toEqual([["tasks", "1"], ["meditation", "0"]]);
    expect(w).toMatchObject({ start: "2026-10-19", end: "2026-10-25", days: 3, daysWithData: 1 });
  });
  it("uses the report's own counts for study, meditation and reading", () => {
    const m = computeReport({
      ...blank,
      study: [{ date: "2026-10-20", minutes: 45, book: false, pages: 0 }, { date: "2026-10-21", minutes: 30, book: true, pages: 20 }],
      meditation: [{ date: "2026-10-21", minutes: 10 }],
    }, "weekly", "2026-10-19", "2026-10-25", "2026-10-21", TZ);
    const byKey = Object.fromEntries(weekView(m, "2026-10-25").items.map((x) => [x.key, x]));
    expect(byKey.study.hint).toBe("2 sessions");
    expect(byKey.reading.value).toBe("20");
    expect(byKey.meditation.hint).toBe("1 day");
  });
});
