"use server";

import { revalidatePath } from "next/cache";
import { adminClient } from "@/server/notify/admin";
import { GoogleAuthError, disconnect, syncUser } from "@/server/google/sync";
import { googleConfigured } from "@/server/google/config";
import { DEMO_RESULT, type ActionResult } from "./result";
import { liveContext } from "./guard";

function refresh() {
  revalidatePath("/integrations");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function syncGoogleNow(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const db = adminClient();
  if (!db || !googleConfigured()) return { ok: false, error: "Google Calendar isn't set up on the server yet." };
  try {
    const r = await syncUser(db, ctx.viewer.userId);
    refresh();
    if (!r) return { ok: false, error: "Google Calendar isn't connected." };
    const n = r.pulled + r.pushed;
    return { ok: true, message: n ? `Synced. ${n} change${n === 1 ? "" : "s"}.` : "Synced. Everything was already up to date." };
  } catch (e) {
    refresh();
    return { ok: false, error: e instanceof GoogleAuthError ? "Google needs you to sign in again. Tap Reconnect." : "Couldn't reach Google Calendar. It will try again in a couple of minutes." };
  }
}

export async function disconnectGoogle(): Promise<ActionResult> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const db = adminClient();
  if (!db) return { ok: false, error: "Google Calendar isn't set up on the server yet." };
  await disconnect(db, ctx.viewer.userId);
  refresh();
  return { ok: true, message: "Google Calendar disconnected. Events from Google were removed; yours stay." };
}
