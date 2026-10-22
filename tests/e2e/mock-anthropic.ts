import http from "node:http";

/**
 * A scripted stand-in for the Anthropic Messages API, so the assistant can be
 * tested end to end without a key or any spending. Start the app with
 *   ANTHROPIC_API_KEY=e2e-mock ANTHROPIC_BASE_URL=http://127.0.0.1:3299
 * It answers by looking at the last message, and keeps every request so
 * tests can check what the app sent.
 */

type Block = { type: string; text?: string; content?: string; tool_use_id?: string; name?: string; id?: string };
type Msg = { role: string; content: string | Block[] };
export type SeenRequest = { headers: http.IncomingHttpHeaders; body: { model: string; system: string | { text: string; cache_control?: unknown }[]; tools?: { name: string }[]; messages: Msg[]; output_config?: unknown } };

const blocks = (m: Msg): Block[] => (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content);

function reply(content: Block[], stop: string, model: string) {
  return { id: `msg_${Math.random().toString(36).slice(2)}`, type: "message", role: "assistant", model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
}

function answer(req: SeenRequest["body"]) {
  const last = req.messages[req.messages.length - 1];
  const lastBlocks = blocks(last);
  const text = lastBlocks.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  const results = lastBlocks.filter((b) => b.type === "tool_result");
  const tools = new Set((req.tools ?? []).map((t) => t.name));
  const toolUse = (name: string, input: unknown) => reply([{ type: "thinking", thinking: "", signature: "mock-signature" } as Block, { type: "tool_use", id: `toolu_${name}_${req.messages.length}`, name, input } as Block], "tool_use", req.model);
  const say = (t: string) => reply([{ type: "text", text: t }], "end_turn", req.model);

  const sys = typeof req.system === "string" ? req.system : req.system?.[0]?.text ?? "";
  if (sys.startsWith("You write short, plain summaries")) {
    return text.includes("morning's briefing") ? say("**Today**\n- Nothing overdue.\n\n*Suggestion:* start with your top task.") : say("A steady week, based on the saved counts.");
  }
  if (results.length) {
    const r = results[0];
    if (r.content?.startsWith("Shown to the person as a suggestion")) return say("I've suggested that below. It's added only if you confirm.");
    try {
      const data = JSON.parse(r.content ?? "[]") as { title: string; link: string }[];
      return say(data.length ? `**Facts**\n${data.map((t) => `- [${t.title}](${t.link})`).join("\n")}` : "I don't see any open tasks.");
    } catch {
      return say(`The lookup failed: ${r.content}`);
    }
  }
  if (/remind me to (.+?)( tomorrow)?$/i.test(text) && tools.has("propose_task")) {
    const title = text.match(/remind me to (.+?)( tomorrow)?$/i)![1];
    return toolUse("propose_task", { title: title[0].toUpperCase() + title.slice(1) });
  }
  if (/due|tasks/i.test(text) && tools.has("list_tasks")) return toolUse("list_tasks", { status: "open" });
  if (/money|spend/i.test(text)) return say(tools.has("get_finance_overview") ? "Finance is shared." : "Finance isn't shared with me. You can change that in Settings → AI assistant.");
  return say("Hello! Ask me about your tasks.");
}

export function startMockAnthropic(port = 3299) {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url?.startsWith("/v1/messages")) {
        const body = JSON.parse(raw) as SeenRequest["body"];
        seen.push({ headers: req.headers, body });
        res.writeHead(200, { "content-type": "application/json", "request-id": "req_mock" });
        res.end(JSON.stringify(answer(body)));
        return;
      }
      res.writeHead(404).end();
    });
  });
  return new Promise<{ seen: SeenRequest[]; close: () => Promise<void> }>((resolve) =>
    server.listen(port, "127.0.0.1", () => resolve({ seen, close: () => new Promise((r) => server.close(() => r())) })),
  );
}
