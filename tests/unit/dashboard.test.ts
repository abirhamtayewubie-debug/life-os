import { describe, expect, it } from "vitest";
import { buildDashboard, computeHabit, eventsOnDay, findConflicts, isOverdue } from "@/features/dashboard/compute";
import type { RawEvent, RawHabit, RawLifeData, RawTask, ViewerProfile } from "@/features/dashboard/types";
import { normalizeLayout, DEFAULT_LAYOUT } from "@/features/dashboard/widgets";
import { generateSampleSet, sampleToRaw } from "@/lib/sample-data";

const TZ = "Africa/Addis_Ababa";
const profile: ViewerProfile = { displayName: null, timezone: TZ, locale: "en-US", baseCurrency: "ETB", measurementSystem: "metric" };
const NOW = new Date("2026-10-21T07:00:00Z"); // 10:00 local, Wednesday

const empty: RawLifeData = {
  tasks: [], events: [], reminders: [], habits: [], habitLogs: [], goals: [], projects: [], accounts: [], categories: [],
  budgets: [], transactions: [], wellness: [], sleep: [], wheelCategories: [], wheelAssessments: [], journal: [], notes: [], reviews: [],
};

const task = (o: Partial<RawTask>): RawTask => ({
  id: crypto.randomUUID(), title: "t", status: "todo", priority: 3, area: "personal", due_date: null, due_at: null, is_top_priority: false,
  completed_at: null, project_id: null, goal_id: null, created_at: "2026-09-01T00:00:00Z", source: "manual", ...o,
});

describe("Command Center with no data", () => {
  it("invents nothing", () => {
    const m = buildDashboard(empty, NOW, profile);
    expect(m.priorities).toEqual([]);
    expect(m.finance).toBeNull();
    expect(m.sleep).toBeNull();
    expect(m.wellness).toBeNull();
    expect(m.wheel).toBeNull();
    expect(m.suggestions).toEqual([]);
    expect(m.changes).toEqual([]);
    expect(m.briefing.lines).toEqual(["No calendar events today."]);
  });
});

describe("tasks", () => {
  it("treats date-only tasks as overdue from the next local day", () => {
    expect(isOverdue(task({ due_date: "2026-10-21" }), NOW, "2026-10-21", TZ)).toBe(false);
    expect(isOverdue(task({ due_date: "2026-10-20" }), NOW, "2026-10-21", TZ)).toBe(true);
    expect(isOverdue(task({ due_date: "2026-10-20", status: "done", completed_at: "2026-10-20T10:00:00Z" }), NOW, "2026-10-21", TZ)).toBe(false);
  });

  it("treats timed tasks as overdue once the instant passes", () => {
    expect(isOverdue(task({ due_at: "2026-10-21T06:59:00Z" }), NOW, "2026-10-21", TZ)).toBe(true);
    expect(isOverdue(task({ due_at: "2026-10-21T08:00:00Z" }), NOW, "2026-10-21", TZ)).toBe(false);
  });

  it("orders priorities with explicit focus first and caps at five", () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => task({ title: `p${i}`, priority: 1, due_date: "2026-10-21" })),
      task({ title: "focus", priority: 3, is_top_priority: true }),
    ];
    const m = buildDashboard({ ...empty, tasks }, NOW, profile);
    expect(m.priorities).toHaveLength(5);
    expect(m.priorities[0].title).toBe("focus");
    expect(m.briefing.suggestedPriorities.length).toBeLessThanOrEqual(3);
  });
});

describe("events", () => {
  const ev = (o: Partial<RawEvent>): RawEvent => ({ id: crypto.randomUUID(), title: "e", kind: "event", starts_at: "", ends_at: "", all_day: false, location: null, source: "manual", ...o });

  it("places events on the user's local day", () => {
    // 22:30 UTC on the 20th is 01:30 on the 21st in Addis Ababa.
    const late = ev({ starts_at: "2026-10-20T22:30:00Z", ends_at: "2026-10-20T23:30:00Z" });
    expect(eventsOnDay([late], "2026-10-21", TZ)).toHaveLength(1);
    expect(eventsOnDay([late], "2026-10-20", TZ)).toHaveLength(0);
  });

  it("detects overlaps but not back-to-back meetings", () => {
    const a = ev({ title: "a", starts_at: "2026-10-21T08:00:00Z", ends_at: "2026-10-21T09:00:00Z" });
    const b = ev({ title: "b", starts_at: "2026-10-21T09:00:00Z", ends_at: "2026-10-21T10:00:00Z" });
    const c = ev({ title: "c", starts_at: "2026-10-21T09:30:00Z", ends_at: "2026-10-21T09:45:00Z" });
    const pairs = findConflicts([a, b, c]).map(([x, y]) => x.title + y.title);
    expect(pairs).toEqual(["bc"]);
  });
});

describe("habits", () => {
  const habit: RawHabit = {
    id: "h1", name: "Workout", cadence: "daily", schedule_days: [1, 3, 5], target_per_period: 1, time_of_day: "evening",
    paused_at: null, created_at: "2026-09-01T00:00:00Z", source: "manual",
  };

  it("counts consistency only on scheduled days and doesn't penalise today early", () => {
    // Log every Mon/Wed/Fri in the window except one.
    const logs = [] as { habit_id: string; log_date: string; count: number }[];
    for (let d = new Date("2026-09-21"); d < new Date("2026-10-21"); d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      if ([1, 3, 5].includes(d.getUTCDay()) && k !== "2026-10-09") logs.push({ habit_id: "h1", log_date: k, count: 1 });
    }
    const v = computeHabit(habit, logs, "2026-10-21", TZ);
    expect(v.scheduledToday).toBe(true);
    expect(v.doneToday).toBe(false);
    expect(v.scheduled30).toBe(13);
    expect(v.consistency30).toBe(Math.round((12 / 13) * 100));
    expect(v.streak).toBe(4); // Oct 12, 14, 16, 19; the 9th was missed
    expect(v.last7.map((d) => d.state)).toEqual(["off", "done", "off", "off", "done", "off", "future"]);
  });

  it("has no consistency figure before anything was scheduled", () => {
    const v = computeHabit({ ...habit, created_at: "2026-10-21T05:00:00Z" }, [], "2026-10-21", TZ);
    expect(v.consistency30).toBeNull();
  });
});

describe("sample data", () => {
  const set = generateSampleSet(NOW, TZ);

  it("labels every generated row as sample", () => {
    for (const [table, rows] of Object.entries(set)) {
      for (const r of rows as Record<string, unknown>[]) {
        if ("source" in r) expect(r.source, table).toBe("sample");
      }
    }
  });

  it("is deterministic", () => {
    expect(generateSampleSet(NOW, TZ).tasks.map((t) => t.id)).toEqual(set.tasks.map((t) => t.id));
  });

  it("builds a dashboard that never combines currencies", () => {
    const m = buildDashboard(sampleToRaw(set), NOW, profile);
    expect(m.finance?.netByCurrency.map((n) => n.currency).sort()).toEqual(["ETB", "USD"]);
    for (const b of m.finance?.budgets ?? []) for (const l of b.lines) expect(l.spent.currency).toBe(b.currency);
    expect(m.wheel?.ratings).toHaveLength(10);
    expect(m.suggestions.every((s) => s.evidence.length > 0)).toBe(true);
  });
});

describe("dashboard layout", () => {
  it("drops unknown widgets, fixes invalid sizes and appends new ones", () => {
    const l = normalizeLayout([{ key: "habits", size: "sm", visible: false }, { key: "bogus" as never, size: "md", visible: true }]);
    expect(l[0]).toEqual({ key: "habits", size: "md", visible: false });
    expect(l).toHaveLength(DEFAULT_LAYOUT.length);
  });
});
