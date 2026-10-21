import { describe, expect, it } from "vitest";
import { addMonths, dueStatus, renewedDueDate } from "@/features/admin/status";
import { allowedParents, buildTree, flatten, metricPct, milestonePct } from "@/features/goals/tree";
import type { GoalRecord } from "@/features/goals/types";
import { extractWikilinks, parseTags, resolveTitles, segments } from "@/features/knowledge/wikilinks";
import { daysWritten, writingStreak } from "@/features/reflection/streak";
import { contactState, nextOccurrence, upcomingDates, yearsAt } from "@/features/relationships/dates";
import type { Person } from "@/features/relationships/types";
import { compareLatest, categoryHistory } from "@/features/wheel/compare";
import { entryMinutes, formatDuration, projectProgress, weekStart, weekTotals } from "@/features/work/stats";

const goal = (id: string, level: GoalRecord["level"], parent_id: string | null = null, extra: Partial<GoalRecord> = {}): GoalRecord => ({
  id, parent_id, level, title: id, status: "active", wheel_category_id: null, description: null, why: null, target_date: null,
  metric_label: null, metric_target: null, metric_current: null, completed_at: null, source: "manual", ...extra,
} as GoalRecord);

describe("goals tree", () => {
  const goals = [goal("v", "vision"), goal("y", "annual", "v"), goal("q", "quarterly", "y"), goal("orphan", "quarterly", "missing")];

  it("nests children and keeps orphans as roots", () => {
    const tree = buildTree(goals);
    expect(tree.map((n) => n.id).sort()).toEqual(["orphan", "v"]);
    expect(flatten(tree).find((n) => n.id === "q")?.depth).toBe(2);
  });

  it("only offers broader goals that aren't descendants as parents", () => {
    expect(allowedParents(goals[1], "annual", goals).map((g) => g.id)).toEqual(["v"]);
    // Moving the vision down a level can't place it under its own descendants.
    expect(allowedParents(goals[0], "quarterly", goals).map((g) => g.id)).toEqual([]);
    expect(allowedParents(null, "quarterly", goals).map((g) => g.id).sort()).toEqual(["v", "y"]);
  });

  it("never invents a metric percentage", () => {
    expect(metricPct({ metric_target: null, metric_current: "5" })).toBeNull();
    expect(metricPct({ metric_target: "0", metric_current: "5" })).toBeNull();
    expect(metricPct({ metric_target: "24", metric_current: "6" })).toBe(25);
    expect(metricPct({ metric_target: "10", metric_current: "15" })).toBe(100);
    expect(milestonePct([])).toBeNull();
    expect(milestonePct([{ completed_at: "x" }, { completed_at: null }])).toBe(50);
  });
});

describe("work stats", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("counts running timers up to now and formats durations", () => {
    expect(entryMinutes({ started_at: "2026-10-21T11:15:00Z", ended_at: null }, now)).toBe(45);
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(135)).toBe("2 h 15 min");
  });
  it("totals the current Monday-to-Sunday week by project", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    const e = (p: string | null, s: string, en: string) => ({ id: s, project_id: p, task_id: null, started_at: s, ended_at: en, note: null, source: "manual" as const });
    const totals = weekTotals([e("a", "2026-10-19T08:00:00Z", "2026-10-19T09:00:00Z"), e("a", "2026-10-18T08:00:00Z", "2026-10-18T09:00:00Z"), e(null, "2026-10-20T08:00:00Z", "2026-10-20T08:30:00Z")], "2026-10-21", "UTC", now);
    expect(totals.get("a")).toBe(60);
    expect(totals.get(null)).toBe(30);
  });
  it("ignores subtasks and cancelled tasks in project progress", () => {
    const t = (status: string, parent: string | null = null) => ({ project_id: "p", parent_task_id: parent, status }) as never;
    expect(projectProgress({ id: "p" }, [t("done"), t("todo"), t("cancelled"), t("done", "x")])).toEqual({ done: 1, total: 2, pct: 50 });
    expect(projectProgress({ id: "p" }, []).pct).toBeNull();
  });
});

describe("wheel compare", () => {
  const cats = [{ id: "a", name: "Health", sort_order: 0, archived_at: null }, { id: "b", name: "Career", sort_order: 1, archived_at: null }] as never;
  const assessments = [
    { id: "2", assessed_on: "2026-10-01", note: null, source: "manual", ratings: [{ category_id: "a", score: 7, desired_score: 9 }] },
    { id: "1", assessed_on: "2026-07-01", note: null, source: "manual", ratings: [{ category_id: "a", score: 5, desired_score: 8 }, { category_id: "b", score: 6, desired_score: null }] },
  ] as never;
  it("compares each area with the previous check-in, leaving unrated areas empty", () => {
    const rows = compareLatest(cats, assessments);
    expect(rows[0]).toMatchObject({ score: 7, desired: 9, gap: 2, change: 2 });
    expect(rows[1]).toMatchObject({ score: null, gap: null, change: null });
    expect(categoryHistory("a", assessments).map((h) => h.score)).toEqual([5, 7]);
  });
});

describe("journal rhythm", () => {
  it("counts a streak ending today or yesterday", () => {
    expect(writingStreak(["2026-10-21", "2026-10-20", "2026-10-18"], "2026-10-21")).toBe(2);
    expect(writingStreak(["2026-10-20", "2026-10-19"], "2026-10-21")).toBe(2);
    expect(writingStreak(["2026-10-18"], "2026-10-21")).toBe(0);
    expect(daysWritten(["2026-10-21", "2026-10-21", "2026-09-01"], "2026-10-21")).toBe(1);
  });
});

describe("wikilinks", () => {
  it("extracts unique titles case-insensitively", () => {
    expect(extractWikilinks("See [[Brand]] and [[brand]] and [[ Site plan ]]. Not [[]] or [[a\nb]]")).toEqual(["Brand", "Site plan"]);
  });
  it("splits text for rendering", () => {
    expect(segments("a [[B]] c")).toEqual([{ text: "a " }, { link: "B" }, { text: " c" }]);
  });
  it("resolves to the newest matching note and skips self-links", () => {
    const index = [{ id: "new", title: "Brand" }, { id: "old", title: "brand" }, { id: "me", title: "Me" }];
    expect(resolveTitles(["BRAND", "Me", "Nope"], index, "me")).toEqual({ resolved: ["new"], missing: ["Nope"] });
  });
  it("normalises tags", () => {
    expect(parseTags(" #Design, design, client ,, ")).toEqual(["Design", "client"]);
  });
});

describe("important dates", () => {
  it("finds the next occurrence, moving 29 Feb to 28 Feb in common years", () => {
    expect(nextOccurrence("1992-12-01", "2026-10-21")).toBe("2026-12-01");
    expect(nextOccurrence("1992-03-01", "2026-10-21")).toBe("2027-03-01");
    expect(nextOccurrence("1992-10-21", "2026-10-21")).toBe("2026-10-21");
    expect(nextOccurrence("2000-02-29", "2026-10-21")).toBe("2027-02-28");
    expect(nextOccurrence("2000-02-29", "2027-10-21")).toBe("2028-02-29");
    expect(nextOccurrence("2026-01-01", "2026-10-21", false)).toBeNull();
    expect(yearsAt("1992-12-01", "2026-12-01")).toBe(34);
  });
  it("lists birthdays and dates within the window, soonest first", () => {
    const p = { id: "p", name: "Hana", birthday: "1992-11-08", contact_every_days: null, last_contacted_on: null } as Person;
    const d = { id: "d", person_id: null, kind: "anniversary" as const, title: "Studio", date: "2020-10-25", recurs_yearly: true, remind_days_before: 7, source: "manual" as const };
    const far = { ...d, id: "far", title: "Far", date: "2020-06-01" };
    const up = upcomingDates([p], [d, far], "2026-10-21");
    expect(up.map((u) => [u.title, u.inDays, u.years])).toEqual([["Studio", 4, 6], ["Hana's birthday", 18, 34]]);
  });
  it("works out keep-in-touch status only when a rhythm is set", () => {
    expect(contactState({ contact_every_days: null, last_contacted_on: null }, "2026-10-21").status).toBe("none");
    expect(contactState({ contact_every_days: 7, last_contacted_on: null }, "2026-10-21").status).toBe("never");
    expect(contactState({ contact_every_days: 7, last_contacted_on: "2026-10-10" }, "2026-10-21")).toEqual({ due: "2026-10-17", overdueDays: 4, status: "due" });
    expect(contactState({ contact_every_days: 7, last_contacted_on: "2026-10-18" }, "2026-10-21").status).toBe("ok");
  });
});

describe("home admin", () => {
  it("adds months, clamping to the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-12-15", 12)).toBe("2028-12-15");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
  });
  it("renews from the old expiry, or from today when renewing late", () => {
    expect(renewedDueDate("2026-10-30", 12, "2026-10-21")).toBe("2027-10-30");
    expect(renewedDueDate("2025-01-10", 6, "2026-10-21")).toBe("2027-04-21");
  });
  it("flags due items by their own reminder window and never nags about documents", () => {
    const base = { kind: "renewal" as const, remind_days_before: 14, completed_at: null };
    expect(dueStatus({ ...base, due_on: "2026-10-30" }, "2026-10-21")).toEqual({ status: "soon", inDays: 9 });
    expect(dueStatus({ ...base, due_on: "2026-12-30" }, "2026-10-21").status).toBe("later");
    expect(dueStatus({ ...base, due_on: "2026-10-01" }, "2026-10-21")).toEqual({ status: "overdue", inDays: -20 });
    expect(dueStatus({ ...base, kind: "document", due_on: "2026-10-01" }, "2026-10-21").status).toBe("none");
    expect(dueStatus({ ...base, due_on: "2026-10-01", completed_at: "x" }, "2026-10-21").status).toBe("done");
  });
});
