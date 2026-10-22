import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/server/notify/admin";
import { dispatchDue } from "@/server/notify/dispatch";

/**
 * Sends due reminders to devices (and email, once set up). Called every
 * minute by a scheduler with `Authorization: Bearer <CRON_SECRET>`; see
 * docs/DEPLOYMENT.md. Without the secret it does nothing.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 32 || !safeEqual(given, secret)) return new Response("Not allowed.", { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "The reminder sender isn't configured (SUPABASE_SECRET_KEY)." }, { status: 503 });
  try {
    const summary = await dispatchDue(db);
    return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("reminder dispatch failed", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "Dispatch failed; it will run again on the next call." }, { status: 500 });
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const GET = handle;
export const POST = handle;
