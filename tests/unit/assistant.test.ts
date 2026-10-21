import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/server/reports", () => ({ getReport: vi.fn() }));

import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AI_SETTINGS, estimateCostUsd, permittedScopes, type AiSettings } from "@/features/assistant/models";
import { isInternalHref, parseBlocks, parseInline } from "@/features/assistant/markdown";
import { runTurn, type Persist, type ToolCallRecord } from "@/server/ai/run";
import { ALL_TOOLS, toApiTool, toolsFor, type AnyTool, type ToolContext } from "@/server/ai/tools";

const settings = (over: Partial<AiSettings> = {}): AiSettings => ({ ...DEFAULT_AI_SETTINGS, enabled: true, ...over });

function message(content: unknown[], stop: Anthropic.StopReason, usage = { input_tokens: 100, output_tokens: 20 }): Anthropic.Message {
  return { id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5", content, stop_reason: stop, stop_sequence: null, usage } as unknown as Anthropic.Message;
}

function harness(replies: Anthropic.Message[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const saved: { role: string; content: unknown }[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const persist: Persist = {
    saveMessage: async (role, content) => { saved.push({ role, content: structuredClone(content) }); return `m${saved.length}`; },
    saveToolCall: async (r) => { toolCalls.push(r); },
  };
  const create = vi.fn(async (p: Anthropic.MessageCreateParamsNonStreaming) => {
    calls.push(structuredClone(p));
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    return next;
  });
  return { calls, saved, toolCalls, persist, create };
}

const ctx = { today: "2026-10-21", timezone: "Africa/Addis_Ababa", settings: settings() } as unknown as ToolContext;

type RunFn = (ctx: ToolContext, input: unknown) => Promise<{ data: unknown; count: number; summary: string }>;
const readTool = (run: RunFn = async () => ({ data: [{ title: "Pay rent", link: "/tasks?open=1" }], count: 1, summary: "Read 1 task" })): AnyTool => ({
  name: "list_tasks", scope: "tasks", kind: "read", description: "", input: z.object({ limit: z.number().int().max(50).default(10) }), run,
});
const proposeTool = (prepare = vi.fn(async () => ({ ok: true as const, summary: "Add task “Call Abebe”" }))): AnyTool => ({
  name: "propose_task", scope: "tasks", kind: "propose", description: "", input: z.object({ title: z.string().min(1) }), prepare,
});

describe("assistant runner", () => {
  it("runs read tools, returns their results in one message, then answers", async () => {
    const run = vi.fn<RunFn>(async () => ({ data: [{ title: "Pay rent" }], count: 1, summary: "Read 1 task" }));
    const h = harness([
      message([{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "list_tasks", input: {} }, { type: "tool_use", id: "t2", name: "list_tasks", input: { limit: 5 } }], "tool_use"),
      message([{ type: "text", text: "**Facts**\n- [Pay rent](/tasks?open=1) is due today." }], "end_turn", { input_tokens: 300, output_tokens: 40 }),
    ]);
    const out = await runTurn({ create: h.create, model: "claude-haiku-5-5", effort: "low", history: [{ role: "user", content: "What's due?" }], tools: [readTool(run)], ctx, context: "Today is …", persist: h.persist });

    expect(out.stop).toBe("answered");
    expect(out.usage).toEqual({ input: 400, output: 60, cacheRead: 0, cacheWrite: 0 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1]).toEqual({ limit: 10 }); // zod defaults applied
    // Second request replays the assistant content unchanged (thinking included) and both results in ONE user message.
    const second = h.calls[1].messages;
    expect(second[1].content).toEqual([{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "list_tasks", input: {} }, { type: "tool_use", id: "t2", name: "list_tasks", input: { limit: 5 } }]);
    expect(second[2].role).toBe("user");
    expect((second[2].content as Anthropic.ToolResultBlockParam[]).map((b) => b.tool_use_id)).toEqual(["t1", "t2"]);
    expect(h.toolCalls.map((t) => t.status)).toEqual(["completed", "completed"]);
    expect(h.saved.map((s) => s.role)).toEqual(["assistant", "user", "assistant"]);
  });

  it("caches the stable prompt and keeps the date after the cache breakpoint", async () => {
    const h = harness([message([{ type: "text", text: "Hi" }], "end_turn")]);
    await runTurn({ create: h.create, model: "claude-haiku-5-5", effort: "low", history: [{ role: "user", content: "hi" }], tools: [], ctx, context: "Today is Wednesday", persist: h.persist });
    const system = h.calls[0].system as Anthropic.TextBlockParam[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[0].text).not.toContain("Wednesday");
    expect(system[1].text).toBe("Today is Wednesday");
    expect(h.calls[0].tools).toBeUndefined();
    expect(h.calls[0].output_config).toEqual({ effort: "low" });
  });

  it("never applies a proposal: it is stored as pending and the model is told so", async () => {
    const h = harness([
      message([{ type: "tool_use", id: "p1", name: "propose_task", input: { title: "Call Abebe" } }], "tool_use"),
      message([{ type: "text", text: "I've suggested it; confirm below." }], "end_turn"),
    ]);
    const out = await runTurn({ create: h.create, model: "m", effort: "low", history: [{ role: "user", content: "remind me to call Abebe" }], tools: [proposeTool()], ctx, context: "", persist: h.persist });
    expect(out.proposals).toBe(1);
    expect(h.toolCalls[0]).toMatchObject({ name: "propose_task", status: "pending_confirmation", requiresConfirmation: true, resultSummary: "Add task “Call Abebe”" });
    const result = (h.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[])[0];
    expect(result.content).toContain("has NOT been done");
  });

  it("refuses unknown or unshared tools and bad input without running anything", async () => {
    const run = vi.fn<RunFn>();
    const h = harness([
      message([
        { type: "tool_use", id: "a", name: "get_finance_overview", input: {} },
        { type: "tool_use", id: "b", name: "list_tasks", input: { limit: 500 } },
        { type: "tool_use", id: "c", name: "propose_task", input: { title: "" } },
      ], "tool_use"),
      message([{ type: "text", text: "Sorry." }], "end_turn"),
    ]);
    await runTurn({ create: h.create, model: "m", effort: "low", history: [{ role: "user", content: "x" }], tools: [readTool(run), proposeTool()], ctx, context: "", persist: h.persist });
    expect(run).not.toHaveBeenCalled();
    expect(h.toolCalls.map((t) => t.status)).toEqual(["denied", "failed", "failed"]);
    const results = h.calls[1].messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results.every((r) => r.is_error)).toBe(true);
  });

  it("passes tool errors back to the model instead of failing the turn", async () => {
    const h = harness([
      message([{ type: "tool_use", id: "a", name: "list_tasks", input: {} }], "tool_use"),
      message([{ type: "text", text: "I couldn't read your tasks." }], "end_turn"),
    ]);
    const out = await runTurn({ create: h.create, model: "m", effort: "low", history: [], tools: [readTool(vi.fn(async () => { throw new Error("Couldn't read tasks."); }))], ctx, context: "", persist: h.persist });
    expect(out.stop).toBe("answered");
    expect(h.toolCalls[0]).toMatchObject({ status: "failed", error: "Couldn't read tasks." });
  });

  it("stops on a refusal and after too many steps", async () => {
    const r = harness([message([], "refusal")]);
    expect((await runTurn({ create: r.create, model: "m", effort: "low", history: [], tools: [], ctx, context: "", persist: r.persist })).stop).toBe("refusal");
    const loop = harness(Array.from({ length: 3 }, (_, i) => message([{ type: "tool_use", id: `t${i}`, name: "list_tasks", input: {} }], "tool_use")));
    const out = await runTurn({ create: loop.create, model: "m", effort: "low", history: [], tools: [readTool()], ctx, context: "", persist: loop.persist, maxSteps: 3 });
    expect(out.stop).toBe("too_many_steps");
    expect(loop.create).toHaveBeenCalledTimes(3);
  });
});

describe("data permissions", () => {
  const names = (s: AiSettings) => toolsFor(s).map((t) => t.name);
  it("offers nothing until areas are shared", () => {
    expect(names(settings())).toEqual([]);
  });
  it("offers only the shared modules' tools, and sensitive areas only with their own switch", () => {
    const n = names(settings({ allowedModules: ["tasks", "calendar"] }));
    expect(n).toEqual(expect.arrayContaining(["list_tasks", "list_events", "propose_task", "propose_complete_task", "propose_event"]));
    expect(n).not.toContain("get_health_summary");
    expect(n).not.toContain("get_finance_overview");
    expect(n).not.toContain("list_journal_entries");
    expect(n).not.toContain("list_habits");
    expect(names(settings({ includeHealth: true }))).toEqual(["get_health_summary"]);
    expect(names(settings({ includeFinance: true }))).toEqual(["get_finance_overview"]);
    expect(names(settings({ includeJournal: true }))).toEqual(["list_journal_entries"]);
    expect([...permittedScopes(settings({ allowedModules: ["habits"], includeHealth: true }))].sort()).toEqual(["habits", "health"]);
  });
  it("every tool has a unique, valid name and an object schema without $schema", () => {
    const all = ALL_TOOLS.map(toApiTool);
    expect(new Set(all.map((t) => t.name)).size).toBe(all.length);
    for (const t of all) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{1,60}$/);
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
    }
    expect(ALL_TOOLS.filter((t) => t.kind === "propose").every((t) => t.name.startsWith("propose_"))).toBe(true);
  });
});

describe("cost estimate", () => {
  it("prices tokens per model, including cache reads and writes", () => {
    expect(estimateCostUsd({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }, "claude-haiku-5-5")).toBeCloseTo(0.6);
    expect(estimateCostUsd({ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 }, "claude-sonnet-5-5")).toBeCloseTo(2.7);
    // An unknown model is priced as the dearest, never as free.
    expect(estimateCostUsd({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, "mystery")).toBeCloseTo(4);
  });
});

describe("assistant markdown", () => {
  it("links only inside the app", () => {
    expect(isInternalHref("/tasks?open=abc")).toBe(true);
    expect(isInternalHref("//evil.example")).toBe(false);
    expect(isInternalHref("https://evil.example")).toBe(false);
    expect(isInternalHref("javascript:alert(1)")).toBe(false);
    expect(parseInline("see [rent](/tasks?open=1) and [x](https://evil.example)")).toEqual(["see ", { link: "/tasks?open=1", text: ["rent"] }, " and ", "x"]);
  });
  it("parses headings, lists and paragraphs", () => {
    expect(parseBlocks("**Facts**\n- one\n- two\n\n1. a\n2. b\nplain")).toEqual([
      { kind: "p", text: "**Facts**" }, { kind: "ul", items: ["one", "two"] }, { kind: "ol", items: ["a", "b"] }, { kind: "p", text: "plain" },
    ]);
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual(["<img src=x onerror=alert(1)>"]);
  });
});
