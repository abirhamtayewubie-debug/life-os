import "server-only";
import { localDateKey, zonedTimeToUtc } from "@/lib/dates";
import { DEFAULT_AI_SETTINGS, estimateCostUsd, isModelId, AI_MODULES, type AiModule, type AiSettings, type Usage } from "@/features/assistant/models";
import type { ToolContext } from "./tools";
import { aiConfigured } from "./client";

type Supabase = ToolContext["supabase"];

const MODULE_KEYS = new Set<string>(AI_MODULES.map((m) => m.key));

export async function loadAiSettings(supabase: Supabase): Promise<AiSettings> {
  const { data, error } = await supabase
    .from("ai_settings")
    .select("enabled, model, allowed_modules, include_health, include_finance, include_private_journal, monthly_budget_usd::text, retain_conversations_days")
    .maybeSingle();
  if (error) throw new Error("Couldn't load the assistant settings.");
  if (!data) return DEFAULT_AI_SETTINGS;
  return {
    enabled: data.enabled,
    model: isModelId(data.model) ? data.model : DEFAULT_AI_SETTINGS.model,
    allowedModules: (data.allowed_modules as string[]).filter((m): m is AiModule => MODULE_KEYS.has(m)),
    includeHealth: data.include_health,
    includeFinance: data.include_finance,
    includeJournal: data.include_private_journal,
    monthlyBudgetUsd: Number(data.monthly_budget_usd),
    retainDays: data.retain_conversations_days,
  };
}

export type MonthSpend = { usd: number; calls: number; tokens: number; since: string };

/** Estimated spend since the start of the person's current month. */
export async function monthSpend(supabase: Supabase, timezone: string, now: Date): Promise<MonthSpend> {
  const since = `${localDateKey(now, timezone).slice(0, 7)}-01`;
  const { data, error } = await supabase
    .from("ai_usage")
    .select("model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens")
    .gte("created_at", zonedTimeToUtc(since, "00:00", timezone).toISOString())
    .limit(50000);
  if (error) throw new Error("Couldn't read assistant usage.");
  let usd = 0;
  let tokens = 0;
  for (const r of data ?? []) {
    const u = { input: r.input_tokens, output: r.output_tokens, cacheRead: r.cache_read_tokens, cacheWrite: r.cache_write_tokens };
    usd += estimateCostUsd(u, r.model);
    tokens += u.input + u.output + u.cacheRead + u.cacheWrite;
  }
  return { usd, calls: data?.length ?? 0, tokens, since };
}

export async function recordUsage(supabase: Supabase, userId: string, purpose: "chat" | "briefing" | "report", model: string, u: Usage) {
  await supabase.from("ai_usage").insert({
    user_id: userId, purpose, model,
    input_tokens: u.input, output_tokens: u.output, cache_read_tokens: u.cacheRead, cache_write_tokens: u.cacheWrite,
  });
}

/** Why the assistant can't run right now, in words for the person, or null when it can. */
export async function blockedReason(supabase: Supabase, settings: AiSettings, timezone: string, now: Date): Promise<string | null> {
  if (!aiConfigured()) return "The assistant isn't connected yet: the server has no Anthropic API key.";
  if (!settings.enabled) return "The assistant is switched off. Turn it on in Settings → AI assistant.";
  const spend = await monthSpend(supabase, timezone, now);
  if (spend.usd >= settings.monthlyBudgetUsd)
    return `This month's assistant budget ($${settings.monthlyBudgetUsd.toFixed(2)}) is used up (an estimate from token counts). Raise it in Settings → AI assistant, or wait for next month.`;
  const { count } = await supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", new Date(now.getTime() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 60) return "That's a lot of requests in a few minutes. Please wait a little and try again.";
  return null;
}
