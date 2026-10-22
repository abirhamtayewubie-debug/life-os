import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * The one privileged database client: used only by the reminder sender, which
 * has to look across everyone's due reminders. It never runs for a browser
 * request; the cron route checks CRON_SECRET first.
 */
export function adminClient() {
  const env = supabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!env || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
