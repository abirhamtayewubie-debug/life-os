/**
 * Assistant models, their published per-token prices, and the data scopes a
 * person can share. Shared by the server (budget checks) and Settings.
 */

export const MODEL_IDS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type ModelId = (typeof MODEL_IDS)[number];
export const DEFAULT_MODEL: ModelId = "claude-haiku-5-5";

/** USD per million tokens (Anthropic API list prices, prompts under 100K tokens for Haiku). */
export const MODELS: Record<ModelId, { label: string; blurb: string; input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-5-5": { label: "Haiku 5.5", blurb: "Fast and very cheap; fine for lookups and short plans.", input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", blurb: "Stronger planning and summaries, about 20× Haiku's price.", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { label: "Opus 5.5", blurb: "The most capable, about twice Sonnet's price.", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export const isModelId = (v: string): v is ModelId => (MODEL_IDS as readonly string[]).includes(v);
export const modelLabel = (v: string | null | undefined) => (v && isModelId(v) ? MODELS[v].label : v ?? "Assistant");

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** An estimate in USD from token counts; the provider's invoice is the real figure. */
export function estimateCostUsd(u: Usage, model: string): number {
  const p = isModelId(model) ? MODELS[model] : MODELS["claude-opus-5-5"]; // unknown model: assume the dearest
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

/** Modules the assistant may read, each switched on separately. */
export const AI_MODULES = [
  { key: "tasks", label: "Tasks" },
  { key: "calendar", label: "Calendar" },
  { key: "habits", label: "Habits" },
  { key: "goals", label: "Goals" },
  { key: "work", label: "Work & projects" },
  { key: "learning", label: "Learning" },
  { key: "relationships", label: "Relationships (names and dates, never your notes)" },
  { key: "admin", label: "Home & admin" },
  { key: "knowledge", label: "Knowledge base notes" },
  { key: "reports", label: "Reports" },
  { key: "wheel", label: "Wheel of Life" },
  { key: "spirit", label: "Reflection (values and daily reviews)" },
] as const;
export type AiModule = (typeof AI_MODULES)[number]["key"];

/** Sensitive areas need their own switch on top of the module list. */
export type AiScope = AiModule | "health" | "finance" | "journal";

export type AiSettings = {
  enabled: boolean;
  model: ModelId;
  allowedModules: AiModule[];
  includeHealth: boolean;
  includeFinance: boolean;
  includeJournal: boolean;
  monthlyBudgetUsd: number;
  retainDays: number;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false, model: DEFAULT_MODEL, allowedModules: [], includeHealth: false, includeFinance: false, includeJournal: false, monthlyBudgetUsd: 5, retainDays: 90,
};

export function permittedScopes(s: AiSettings): Set<AiScope> {
  const scopes = new Set<AiScope>(s.allowedModules);
  if (s.includeHealth) scopes.add("health");
  if (s.includeFinance) scopes.add("finance");
  if (s.includeJournal) scopes.add("journal");
  return scopes;
}
