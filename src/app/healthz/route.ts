import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * For an uptime monitor: 200 when the app is up and the database answers,
 * 503 otherwise. Reads only the public currency list, so it reveals nothing.
 */
export async function GET() {
  const env = supabaseEnv();
  const headers = { "Cache-Control": "no-store" };
  if (!env) return Response.json({ ok: true, database: "not configured (demo mode)" }, { headers });
  const started = Date.now();
  const supabase = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.from("currencies").select("code").limit(1);
  const body = { ok: !error, database: error ? "unreachable" : "ok", ms: Date.now() - started };
  return Response.json(body, { status: error ? 503 : 200, headers });
}
