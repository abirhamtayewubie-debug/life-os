import "server-only";
import { localDateKey } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_AI_SETTINGS, type AiSettings } from "@/features/assistant/models";
import { loadAiSettings, monthSpend, type MonthSpend } from "./ai/account";
import { aiConfigured } from "./ai/client";
import { getViewer } from "./viewer";

export type ProposalView = {
  id: string;
  tool: string;
  summary: string;
  status: "pending_confirmation" | "confirmed" | "rejected" | "expired" | "failed";
  error: string | null;
  link: string | null;
};

export type ChatItem =
  | { kind: "user"; id: string; text: string; at: string }
  | { kind: "assistant"; id: string; text: string; at: string; model: string | null; reads: { name: string; summary: string; ok: boolean }[]; proposals: ProposalView[] };

export type AssistantWorkspace = {
  demo: boolean;
  configured: boolean;
  settings: AiSettings;
  spend: MonthSpend | null;
  conversations: { id: string; title: string; updatedAt: string }[];
  active: { id: string; title: string; items: ChatItem[] } | null;
  briefing: { date: string; content: string; model: string; at: string } | null;
  pending: number;
  today: string;
  timezone: string;
  locale: string;
};

type Block = { type: string; text?: string };

function proposalLink(tool: string, input: Record<string, unknown>, recordId: string | null): string | null {
  if (tool === "propose_task") return recordId ? `/tasks?open=${recordId}` : null;
  if (tool === "propose_complete_task") return `/tasks?open=${input.task_id}`;
  if (tool === "propose_event") return `/calendar?view=day&date=${input.date}`;
  if (tool === "propose_habit_checkin") return "/habits";
  return null;
}

export async function getAssistantWorkspace(sp: Record<string, string | string[] | undefined>, now = new Date()): Promise<AssistantWorkspace> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const today = localDateKey(now, timezone);
  const base = { configured: aiConfigured(), today, timezone, locale };
  if (viewer.mode === "demo") {
    return { ...base, demo: true, settings: DEFAULT_AI_SETTINGS, spend: null, conversations: [], active: null, briefing: null, pending: 0 };
  }

  const supabase = await createSupabaseServerClient();
  const [settings, spend, convs, briefing, pending] = await Promise.all([
    loadAiSettings(supabase),
    monthSpend(supabase, timezone, now),
    supabase.from("ai_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(50),
    supabase.from("ai_briefings").select("briefing_date, content, model, updated_at").eq("briefing_date", today).maybeSingle(),
    supabase.from("ai_tool_calls").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation"),
  ]);
  if (convs.error) throw new Error("Couldn't load conversations.");
  const conversations = (convs.data ?? []).map((c) => ({ id: c.id, title: c.title ?? "Conversation", updatedAt: c.updated_at }));

  const wanted = typeof sp.c === "string" ? sp.c : null;
  const current = wanted ? conversations.find((c) => c.id === wanted) ?? null : null;
  let active: AssistantWorkspace["active"] = null;
  if (current) {
    const [msgs, calls] = await Promise.all([
      supabase.from("ai_messages").select("id, role, content, model, created_at").eq("conversation_id", current.id).order("created_at").order("id").limit(500),
      supabase.from("ai_tool_calls").select("id, message_id, tool_name, input, status, requires_confirmation, result_summary, error, result_record_id").eq("conversation_id", current.id).order("created_at").limit(1000),
    ]);
    if (msgs.error || calls.error) throw new Error("Couldn't load the conversation.");
    const items: ChatItem[] = [];
    for (const m of msgs.data ?? []) {
      const blocks = (Array.isArray(m.content) ? m.content : []) as Block[];
      const text = blocks.filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("\n\n").trim();
      if (m.role === "user") {
        if (text) items.push({ kind: "user", id: m.id, text, at: m.created_at });
        continue;
      }
      // A turn's steps (lookups, then the answer) show as one reply.
      let reply = items[items.length - 1];
      if (!reply || reply.kind !== "assistant") {
        reply = { kind: "assistant", id: m.id, text: "", at: m.created_at, model: m.model, reads: [], proposals: [] };
        items.push(reply);
      }
      if (text) reply.text = reply.text ? `${reply.text}\n\n${text}` : text;
      reply.at = m.created_at;
      for (const c of (calls.data ?? []).filter((c) => c.message_id === m.id)) {
        if (c.requires_confirmation && c.status !== "failed") {
          reply.proposals.push({ id: c.id, tool: c.tool_name, summary: c.result_summary ?? c.tool_name, status: c.status, error: c.error, link: proposalLink(c.tool_name, c.input ?? {}, c.result_record_id) });
        } else if (c.requires_confirmation) {
          // A suggestion the app refused before showing it, or one that failed when confirmed.
          if (c.result_summary) reply.proposals.push({ id: c.id, tool: c.tool_name, summary: c.result_summary, status: "failed", error: c.error, link: null });
        } else {
          reply.reads.push({ name: c.tool_name, summary: c.result_summary ?? (c.status === "denied" ? "Not shared" : "Lookup failed"), ok: c.status === "completed" });
        }
      }
    }
    active = { id: current.id, title: current.title, items };
  }

  return {
    ...base, demo: false, settings, spend, conversations, active,
    briefing: briefing.data ? { date: briefing.data.briefing_date, content: briefing.data.content, model: briefing.data.model, at: briefing.data.updated_at } : null,
    pending: pending.count ?? 0,
  };
}
