export type WidgetSize = "sm" | "md" | "lg" | "full";

export type WidgetKey =
  | "briefing" | "priorities" | "agenda" | "deadlines" | "habits" | "goals" | "finance"
  | "wellness" | "sleep" | "projects" | "wheel" | "journal" | "changes" | "suggestions" | "reminders";

export type WidgetDef = { key: WidgetKey; title: string; description: string; defaultSize: WidgetSize; sizes: WidgetSize[] };

export const WIDGETS: WidgetDef[] = [
  { key: "briefing", title: "Morning briefing", description: "A summary of today built from your records.", defaultSize: "lg", sizes: ["md", "lg", "full"] },
  { key: "priorities", title: "Today's priorities", description: "Your top-priority work for today.", defaultSize: "sm", sizes: ["sm", "md", "lg"] },
  { key: "agenda", title: "Agenda", description: "Today's events and what's coming up.", defaultSize: "md", sizes: ["sm", "md", "lg"] },
  { key: "deadlines", title: "Overdue & due soon", description: "Tasks past due or due in the next three days.", defaultSize: "md", sizes: ["sm", "md", "lg"] },
  { key: "reminders", title: "Reminders", description: "Reminders due today.", defaultSize: "sm", sizes: ["sm", "md"] },
  { key: "habits", title: "Habits", description: "Today's routines and 30-day consistency.", defaultSize: "md", sizes: ["md", "lg"] },
  { key: "goals", title: "Goals", description: "Active goals and measurable progress.", defaultSize: "md", sizes: ["sm", "md", "lg"] },
  { key: "finance", title: "Money", description: "Balances by currency and budget status.", defaultSize: "md", sizes: ["md", "lg"] },
  { key: "projects", title: "Projects", description: "Active projects, progress and deadline risk.", defaultSize: "md", sizes: ["sm", "md", "lg"] },
  { key: "wellness", title: "Mood & energy", description: "Your self-reported check-ins this week.", defaultSize: "sm", sizes: ["sm", "md"] },
  { key: "sleep", title: "Sleep", description: "Logged sleep for the last seven nights.", defaultSize: "sm", sizes: ["sm", "md"] },
  { key: "wheel", title: "Life balance", description: "Your latest Wheel of Life ratings.", defaultSize: "md", sizes: ["md", "lg"] },
  { key: "changes", title: "Since yesterday", description: "What changed since yesterday.", defaultSize: "sm", sizes: ["sm", "md"] },
  { key: "suggestions", title: "Suggestions", description: "Rule-based suggestions with the evidence behind them.", defaultSize: "md", sizes: ["md", "lg"] },
  { key: "journal", title: "Notes & journal", description: "Recent notes and journal entries.", defaultSize: "sm", sizes: ["sm", "md"] },
];

export type WidgetPref = { key: WidgetKey; size: WidgetSize; visible: boolean };

const HIDDEN_BY_DEFAULT: WidgetKey[] = ["briefing", "priorities"];

export const DEFAULT_LAYOUT: WidgetPref[] = [
  "briefing", "priorities", "agenda", "deadlines", "suggestions", "habits", "finance", "goals",
  "projects", "wheel", "reminders", "changes", "sleep", "wellness", "journal",
].map((key) => {
  const def = WIDGETS.find((w) => w.key === key)!;
  // The Today hero already shows the top three, so these two start hidden.
  return { key: def.key, size: def.defaultSize, visible: !HIDDEN_BY_DEFAULT.includes(def.key) };
});

/**
 * Merge stored preferences with the current widget catalogue: unknown keys are
 * dropped, new widgets are appended, invalid sizes fall back to the default.
 */
export function normalizeLayout(stored: Partial<WidgetPref>[] | null | undefined): WidgetPref[] {
  if (!stored?.length) return DEFAULT_LAYOUT;
  const out: WidgetPref[] = [];
  const seen = new Set<string>();
  for (const s of stored) {
    const def = WIDGETS.find((w) => w.key === s.key);
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    out.push({ key: def.key, size: s.size && def.sizes.includes(s.size) ? s.size : def.defaultSize, visible: s.visible ?? true });
  }
  for (const d of DEFAULT_LAYOUT) if (!seen.has(d.key)) out.push(d);
  return out;
}
