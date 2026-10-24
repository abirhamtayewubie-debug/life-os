import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aiConfigured } from "./ai/client";
import { googleConfigured } from "./google/config";
import { pushConfigured } from "./notify/push";
import { getViewer } from "./viewer";

/**
 * What Life OS is connected to, read from this person's own rows (RLS) and
 * from which server settings are present. "Set up" only means the settings
 * exist; anything never seen working says so.
 */
export type IntegrationStatus = {
  demo: boolean;
  timezone: string;
  locale: string;
  push: { configured: boolean; devices: number; lastDelivered: string | null };
  sender: { configured: boolean; lastSent: string | null };
  feed: { on: boolean; lastRead: string | null };
  calendarImported: number;
  appleHealth: { lastImport: string | null; deviceRows: number };
  ai: { configured: boolean };
  google: {
    configured: boolean;
    status: "connected" | "error" | "revoked" | "disconnected" | null;
    account: string | null;
    lastSynced: string | null;
    lastError: string | null;
    events: number;
  };
};

const senderConfigured = () => Boolean(process.env.SUPABASE_SECRET_KEY) && (process.env.CRON_SECRET?.length ?? 0) >= 32;

export async function getIntegrationStatus(): Promise<IntegrationStatus> {
  const viewer = await getViewer();
  const { timezone, locale } = viewer.profile;
  const base = { timezone, locale, ai: { configured: aiConfigured() } };
  const noGoogle = { configured: googleConfigured(), status: null, account: null, lastSynced: null, lastError: null, events: 0 };
  if (viewer.mode === "demo") {
    return { ...base, demo: true, push: { configured: pushConfigured(), devices: 0, lastDelivered: null }, sender: { configured: senderConfigured(), lastSent: null }, feed: { on: false, lastRead: null }, calendarImported: 0, appleHealth: { lastImport: null, deviceRows: 0 }, google: noGoogle };
  }
  const db = await createSupabaseServerClient();
  const count = { count: "exact" as const, head: true };
  const [devices, sent, feed, imported, lastImport, body, sleep, workouts, google, googleEvents] = await Promise.all([
    db.from("push_subscriptions").select("last_success_at").order("last_success_at", { ascending: false, nullsFirst: false }),
    db.from("reminder_deliveries").select("sent_at").eq("status", "sent").neq("channel", "in_app").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("calendar_feeds").select("last_used_at").maybeSingle(),
    db.from("calendar_events").select("id", count).eq("external_provider", "ics").is("archived_at", null),
    db.from("audit_events").select("created_at").eq("action", "health.import_apple").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("body_measurements").select("id", count).eq("source", "device"),
    db.from("sleep_logs").select("id", count).eq("device_name", "Apple Health"),
    db.from("workouts").select("id", count).like("external_id", "apple-health:%"),
    db.from("integrations").select("status, account_label, last_synced_at, last_error").eq("provider", "google_calendar").maybeSingle(),
    db.from("calendar_events").select("id", count).eq("external_provider", "google"),
  ]);
  const g = google.data;
  return {
    ...base,
    demo: false,
    push: { configured: pushConfigured(), devices: devices.data?.length ?? 0, lastDelivered: devices.data?.[0]?.last_success_at ?? null },
    sender: { configured: senderConfigured(), lastSent: sent.data?.sent_at ?? null },
    feed: { on: !!feed.data, lastRead: feed.data?.last_used_at ?? null },
    calendarImported: imported.count ?? 0,
    appleHealth: { lastImport: lastImport.data?.created_at ?? null, deviceRows: (body.count ?? 0) + (sleep.count ?? 0) + (workouts.count ?? 0) },
    google: g
      ? { configured: googleConfigured(), status: g.status, account: g.account_label, lastSynced: g.last_synced_at, lastError: g.last_error, events: googleEvents.count ?? 0 }
      : noGoogle,
  };
}
