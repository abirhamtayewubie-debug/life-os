import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic client lives on the server only. The key comes from the
 * server environment (never NEXT_PUBLIC_), and the model never sees it or
 * any database credential: it can only ask for the tools in ./tools.
 */
let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  return client;
}
