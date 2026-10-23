import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOOGLE_INTEGRATION as INTEGRATION,
  GOOGLE_PROVIDER as PROVIDER,
  fromGoogle,
  googleIdFor,
  lifeOsIdFrom,
  localWins,
  sameFields,
  skipType,
  toGoogle,
  type GoogleEvent,
  type LocalEvent,
} from "@/lib/google-calendar";
import { adminClient } from "../notify/admin";
import { GOOGLE_SCOPE, googleConfig, openToken, sealToken } from "./config";

/**
 * Two-way sync between Life OS and the person's primary Google calendar.
 *
 * Pull: Google's incremental list (a sync token) brings every change since
 * last time; recurring Google events arrive as single occurrences. Push:
 * Life OS events whose needs_push flag is set are created or updated in
 * Google, and deletions queued by the database trigger are sent. When both
 * sides changed the same event, the newer edit wins.
 *
 * Runs with the secret-key client (tokens are unreadable otherwise) and always
 * filters by user_id itself.
 */

type Db = SupabaseClient;
type Integration = { id: string; user_id: string; sync_cursor: string | null };

const PAST_DAYS = 30; // how far back the first sync reaches, both ways
const MAX_PAGES = 40;
const EVENT_COLUMNS = "id, title, description, location, all_day, starts_at, ends_at, timezone, recurrence_rule, external_id, updated_at, needs_push";

export class GoogleAuthError extends Error {}
export class GoogleScopeError extends Error {}

class GoogleHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

async function tokenRequest(params: Record<string, string>) {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google Calendar isn't set up on the server.");
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!res.ok || !json.access_token) {
    if (json.error === "invalid_grant") throw new GoogleAuthError("Google asked you to sign in again.");
    throw new Error(`Google sign-in failed (${res.status}${json.error ? `: ${json.error}` : ""}).`);
  }
  return json;
}

const expiry = (seconds?: number) => new Date(Date.now() + Math.max(60, (seconds ?? 3600) - 60) * 1000).toISOString();

/** Finishes "Connect Google Calendar": swaps the one-time code for tokens and stores them. */
export async function connectWithCode(db: Db, userId: string, code: string, redirectUri: string, verifier: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
  if (!t.scope?.split(" ").includes(GOOGLE_SCOPE)) throw new GoogleScopeError("Calendar access wasn't granted.");
  const { data: row, error } = await db
    .from("integrations")
    .upsert(
      { user_id: userId, provider: INTEGRATION, status: "connected", scopes: [GOOGLE_SCOPE], connected_at: new Date().toISOString(), last_error: null, sync_cursor: null },
      { onConflict: "user_id,provider" },
    )
    .select("id")
    .single();
  if (error || !row) throw new Error("Couldn't save the connection.");
  const { data: cred } = await db.from("integration_credentials").select("refresh_token_encrypted").eq("integration_id", row.id).maybeSingle();
  // Google only sends a refresh token on the first consent; keep the old one otherwise.
  const refresh = t.refresh_token ? sealToken(t.refresh_token) : cred?.refresh_token_encrypted;
  if (!refresh) throw new Error("Google didn't send a long-lived sign-in. Remove Life OS from your Google account's connections and connect again.");
  const { error: credError } = await db.from("integration_credentials").upsert({
    integration_id: row.id,
    user_id: userId,
    access_token_encrypted: sealToken(t.access_token!),
    refresh_token_encrypted: refresh,
    expires_at: expiry(t.expires_in),
  });
  if (credError) throw new Error("Couldn't save the connection.");
  await db.from("audit_events").insert({ user_id: userId, action: "google_calendar.connected", entity_type: "integration", entity_id: row.id, metadata: {} });
}

async function accessToken(db: Db, integration: Integration): Promise<string> {
  const { data: cred } = await db.from("integration_credentials").select("access_token_encrypted, refresh_token_encrypted, expires_at").eq("integration_id", integration.id).eq("user_id", integration.user_id).maybeSingle();
  if (!cred?.refresh_token_encrypted) throw new GoogleAuthError("No Google sign-in is stored.");
  if (cred.access_token_encrypted && cred.expires_at && new Date(cred.expires_at).getTime() > Date.now()) return openToken(cred.access_token_encrypted);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: openToken(cred.refresh_token_encrypted) });
  await db.from("integration_credentials").update({ access_token_encrypted: sealToken(t.access_token!), expires_at: expiry(t.expires_in) }).eq("integration_id", integration.id);
  return t.access_token!;
}

// ---------------------------------------------------------------------------
// Google Calendar API
// ---------------------------------------------------------------------------

async function api<T>(token: string, path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const cfg = googleConfig()!;
  const url = new URL(`${cfg.apiUrl}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401) throw new GoogleAuthError("Google turned down the sign-in.");
  if (!res.ok) throw new GoogleHttpError(res.status, `Google Calendar answered ${res.status}.`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const eventsPath = (id?: string) => `/calendars/primary/events${id ? `/${encodeURIComponent(id)}` : ""}`;

// ---------------------------------------------------------------------------
// Pull: Google → Life OS
// ---------------------------------------------------------------------------

type ListPage = { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string; summary?: string; timeZone?: string };

async function listChanges(token: string, cursor: string | null) {
  const items: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let last: ListPage = {};
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string> = { singleEvents: "true", showDeleted: "true", maxResults: "250" };
    if (cursor) query.syncToken = cursor;
    else query.timeMin = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
    if (pageToken) query.pageToken = pageToken;
    last = await api<ListPage>(token, eventsPath(), { query });
    items.push(...(last.items ?? []));
    pageToken = last.nextPageToken;
    if (!pageToken) break;
  }
  return { items, nextCursor: pageToken ? null : last.nextSyncToken ?? null, calendarName: last.summary ?? null, timeZone: last.timeZone ?? null };
}

type LocalRow = LocalEvent & { external_id: string | null; updated_at: string; needs_push: boolean };

async function pull(db: Db, integration: Integration, token: string, fallbackTz: string) {
  let changes;
  try {
    changes = await listChanges(token, integration.sync_cursor);
  } catch (e) {
    // An expired sync token means "start over with a full list".
    if (e instanceof GoogleHttpError && e.status === 410 && integration.sync_cursor) changes = await listChanges(token, null);
    else throw e;
  }
  const userId = integration.user_id;
  const items = changes.items.filter((e) => !skipType(e));
  const tz = changes.timeZone ?? fallbackTz;

  // Everything already linked to these Google events (and series they belong to).
  const ids = [...new Set(items.flatMap((e) => [e.id, e.recurringEventId].filter(Boolean) as string[]))];
  const linked = new Map<string, LocalRow>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("calendar_events").select(EVENT_COLUMNS).eq("user_id", userId).eq("external_provider", PROVIDER).in("external_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as LocalRow[]) linked.set(r.external_id!, r);
  }
  // Events Life OS created in Google whose link wasn't saved (a sync cut short).
  const orphanIds = items.filter((e) => !linked.has(e.id)).map((e) => lifeOsIdFrom(e.id)).filter(Boolean) as string[];
  const orphans = new Map<string, LocalRow>();
  if (orphanIds.length) {
    const { data } = await db.from("calendar_events").select(EVENT_COLUMNS).eq("user_id", userId).is("external_provider", null).in("id", orphanIds);
    for (const r of (data ?? []) as LocalRow[]) orphans.set(googleIdFor(r.id), r);
  }

  const inserts: Record<string, unknown>[] = [];
  let changed = 0;
  for (const e of items) {
    // Occurrences of a repeating event made in Life OS: the series itself is the Life OS copy.
    if (e.recurringEventId && linked.get(e.recurringEventId)?.recurrence_rule) continue;
    const local = linked.get(e.id) ?? orphans.get(e.id);
    if (e.status === "cancelled") {
      if (local && !localWins(local, e)) {
        await db.from("calendar_events").delete().eq("id", local.id).eq("user_id", userId);
        // The delete trigger queued it for removal in Google; it's already gone there.
        await db.from("calendar_sync_deletions").delete().eq("user_id", userId).eq("provider", PROVIDER).eq("external_id", e.id);
        changed++;
      }
      continue;
    }
    const fields = fromGoogle(e, tz);
    if (!fields) continue;
    const link = { external_provider: PROVIDER, external_id: e.id, synced_at: new Date().toISOString() };
    if (local) {
      if (localWins(local, e)) {
        if (!local.external_id) await db.from("calendar_events").update({ external_provider: PROVIDER, external_id: e.id }).eq("id", local.id).eq("user_id", userId);
        continue;
      }
      // Our own pushes come back from Google unchanged: nothing to write.
      if (local.external_id && !local.needs_push && sameFields(local, fields)) continue;
      await db.from("calendar_events").update({ ...fields, ...link }).eq("id", local.id).eq("user_id", userId);
      changed++;
    } else {
      inserts.push({ ...fields, ...link, user_id: userId, kind: "event", source: "imported" });
    }
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const chunk = inserts.slice(i, i + 200);
    const { error } = await db.from("calendar_events").insert(chunk);
    // Another sync got there first for some of them: add the rest one by one.
    if (error) for (const row of chunk) await db.from("calendar_events").insert(row);
    changed += chunk.length;
  }
  return { changed, cursor: changes.nextCursor, calendarName: changes.calendarName };
}

// ---------------------------------------------------------------------------
// Push: Life OS → Google
// ---------------------------------------------------------------------------

async function push(db: Db, userId: string, token: string) {
  let sent = 0;
  const { data: gone } = await db.from("calendar_sync_deletions").select("id, external_id").eq("user_id", userId).eq("provider", PROVIDER).limit(200);
  for (const d of gone ?? []) {
    try {
      await api(token, eventsPath(d.external_id), { method: "DELETE" });
      sent++;
    } catch (e) {
      if (!(e instanceof GoogleHttpError && (e.status === 404 || e.status === 410))) throw e;
    }
    await db.from("calendar_sync_deletions").delete().eq("id", d.id);
  }

  const since = new Date(Date.now() - PAST_DAYS * 86_400_000);
  const { data } = await db
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .eq("user_id", userId)
    .eq("needs_push", true)
    .is("archived_at", null)
    .neq("source", "sample")
    .neq("kind", "reminder_only")
    .or(`external_provider.is.null,external_provider.eq.${PROVIDER}`)
    .order("updated_at")
    .limit(300);
  const due = ((data ?? []) as LocalRow[]).filter((e) => e.recurrence_rule || new Date(e.ends_at) >= since).slice(0, 100);
  for (const e of due) {
    const body = toGoogle(e);
    let googleId = e.external_id;
    if (googleId) {
      try {
        await api(token, eventsPath(googleId), { method: "PATCH", body });
      } catch (err) {
        if (!(err instanceof GoogleHttpError && (err.status === 404 || err.status === 410))) throw err;
        googleId = null; // removed in Google meanwhile: put it back
      }
    }
    if (!googleId) {
      googleId = googleIdFor(e.id);
      try {
        await api(token, eventsPath(), { method: "POST", body: { ...body, id: googleId } });
      } catch (err) {
        // Already created by an earlier, interrupted run (or deleted there and
        // the id is taken): update it instead.
        if (!(err instanceof GoogleHttpError && err.status === 409)) throw err;
        await api(token, eventsPath(googleId), { method: "PATCH", body: { ...body, status: "confirmed" } });
      }
    }
    // Mark synced only if nobody edited it while we were sending.
    const { data: done } = await db
      .from("calendar_events")
      .update({ external_provider: PROVIDER, external_id: googleId, synced_at: new Date().toISOString() })
      .eq("id", e.id).eq("user_id", userId).eq("updated_at", e.updated_at)
      .select("id");
    if (!done?.length && !e.external_id) await db.from("calendar_events").update({ external_provider: PROVIDER, external_id: googleId }).eq("id", e.id).eq("user_id", userId);
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export type SyncSummary = { pulled: number; pushed: number };

/** Syncs one person now. Problems are recorded on their integration row, then rethrown. */
export async function syncUser(db: Db, userId: string): Promise<SyncSummary | null> {
  if (!googleConfig()) return null;
  const { data: integration } = await db.from("integrations").select("id, user_id, sync_cursor, status").eq("user_id", userId).eq("provider", INTEGRATION).in("status", ["connected", "error"]).maybeSingle();
  if (!integration) return null;
  const { data: profile } = await db.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  try {
    const token = await accessToken(db, integration);
    const p = await pull(db, integration, token, profile?.timezone ?? "UTC");
    const pushed = await push(db, userId, token);
    await db.from("integrations").update({
      status: "connected",
      last_error: null,
      last_synced_at: new Date().toISOString(),
      ...(p.cursor ? { sync_cursor: p.cursor } : {}),
      ...(p.calendarName ? { account_label: p.calendarName.slice(0, 200) } : {}),
    }).eq("id", integration.id);
    return { pulled: p.changed, pushed };
  } catch (e) {
    // Only a refused sign-in stops the scheduler; anything else is retried next minute.
    const auth = e instanceof GoogleAuthError;
    await db.from("integrations").update({
      status: auth ? "error" : "connected",
      last_error: auth ? "Google needs you to sign in again. Tap Reconnect." : `Last sync failed, trying again: ${e instanceof Error ? e.message : "unknown problem"}`.slice(0, 1000),
    }).eq("id", integration.id);
    throw e;
  }
}

/** Called by the every-minute scheduler: syncs anyone not synced in the last two minutes. */
export async function syncDue(db: Db) {
  if (!googleConfig()) return { synced: 0, failed: 0 };
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await db.from("integrations").select("user_id").eq("provider", INTEGRATION).eq("status", "connected")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`).limit(20);
  let synced = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      await syncUser(db, row.user_id);
      synced++;
    } catch (e) {
      failed++;
      console.error("google calendar sync failed", e instanceof Error ? e.message : e);
    }
  }
  return { synced, failed };
}

/**
 * Stops syncing: forgets the tokens (and asks Google to revoke them), removes
 * events that came from Google, and keeps events made in Life OS (unlinked).
 */
export async function disconnect(db: Db, userId: string) {
  const { data: integration } = await db.from("integrations").select("id").eq("user_id", userId).eq("provider", INTEGRATION).maybeSingle();
  if (!integration) return;
  const { data: cred } = await db.from("integration_credentials").select("refresh_token_encrypted").eq("integration_id", integration.id).maybeSingle();
  const cfg = googleConfig();
  if (cfg && cred?.refresh_token_encrypted) {
    try {
      await fetch(cfg.revokeUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: openToken(cred.refresh_token_encrypted) }),
        cache: "no-store",
      });
    } catch {
      // Revoking is a courtesy; the token is deleted here either way.
    }
  }
  await db.from("integration_credentials").delete().eq("integration_id", integration.id);
  await db.from("integrations").update({ status: "disconnected", sync_cursor: null, last_error: null, account_label: null }).eq("id", integration.id);
  await db.from("calendar_events").delete().eq("user_id", userId).eq("external_provider", PROVIDER).eq("source", "imported");
  await db.from("calendar_events").update({ external_provider: null, external_id: null, synced_at: null }).eq("user_id", userId).eq("external_provider", PROVIDER);
  await db.from("calendar_sync_deletions").delete().eq("user_id", userId).eq("provider", PROVIDER);
  await db.from("audit_events").insert({ user_id: userId, action: "google_calendar.disconnected", entity_type: "integration", entity_id: integration.id, metadata: {} });
}

/**
 * After a calendar change in Life OS, send it to Google once the response is
 * out, so saving never waits on Google. Does nothing unless connected.
 */
export function syncSoon(userId: string) {
  if (!googleConfig()) return;
  after(async () => {
    const db = adminClient();
    if (!db) return;
    try {
      await syncUser(db, userId);
    } catch (e) {
      console.error("google calendar sync failed", e instanceof Error ? e.message : e);
    }
  });
}
