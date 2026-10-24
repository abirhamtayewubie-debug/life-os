import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * The one privileged database client: used by the reminder sender, which has
 * to look across everyone's due reminders (the cron route checks CRON_SECRET
 * first), and by Google Calendar sync, which alone may read stored Google
 * tokens. Sync code always filters by the signed-in person's user_id.
 */
export function adminClient() {
  const env = supabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!env || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
