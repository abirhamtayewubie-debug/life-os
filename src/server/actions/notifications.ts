"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deviceLabel, isAllowedPushEndpoint } from "@/features/notifications/endpoints";
import { allowTestEndpoints, pushConfigured, sendPush } from "@/server/notify/push";
import { DEMO_RESULT, type ActionResult } from "./result";
import { audit, liveContext } from "./guard";

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});

/** Saves this browser's push subscription so reminders can reach it. */
export async function savePushSubscription(input: z.input<typeof subscriptionSchema>): Promise<ActionResult> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success || !isAllowedPushEndpoint(parsed.data.endpoint, allowTestEndpoints())) return { ok: false, error: "This browser's notification service isn't supported." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  if (!pushConfigured()) return { ok: false, error: "Notifications aren't set up on the server yet." };
  const ua = (await headers()).get("user-agent") ?? "";
  const { endpoint, keys } = parsed.data;
  // An endpoint belongs to one browser profile; if it was saved before (even by
  // a previous account on this device), this person's save replaces it.
  await ctx.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await ctx.supabase.from("push_subscriptions").insert({ user_id: ctx.viewer.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, label: deviceLabel(ua) });
  if (error) return { ok: false, error: error.code === "23505" ? "This device is linked to another account. Turn notifications off there first." : "Couldn't save this device." };
  await audit(ctx, "notifications.device_added");
  revalidatePath("/settings");
  return { ok: true, message: "Notifications are on for this device." };
}

export async function removePushSubscription(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown device." };
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  const { error } = await ctx.supabase.from("push_subscriptions").delete().eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove the device." };
  await audit(ctx, "notifications.device_removed");
  revalidatePath("/settings");
  return { ok: true, message: "That device won't get notifications any more." };
}

/** Sends a test notification to every device of the signed-in person. */
export async function sendTestNotification(): Promise<ActionResult<{ sent: number; total: number }>> {
  const ctx = await liveContext();
  if (!ctx) return DEMO_RESULT;
  if (!pushConfigured()) return { ok: false, error: "Notifications aren't set up on the server yet." };
  const { data: subs } = await ctx.supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs?.length) return { ok: false, error: "Turn notifications on for a device first." };
  let sent = 0;
  for (const s of subs) {
    const r = await sendPush(s, { title: "Test from Life OS", body: "Notifications work on this device.", url: "/settings#notifications", tag: "test" });
    if (r.ok) {
      sent++;
      await ctx.supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq("id", s.id);
    } else if (r.gone) await ctx.supabase.from("push_subscriptions").delete().eq("id", s.id);
  }
  revalidatePath("/settings");
  if (!sent) return { ok: false, error: "The push service didn't accept it. Try turning notifications off and on again on that device." };
  return { ok: true, data: { sent, total: subs.length }, message: `Sent to ${sent} of ${subs.length} device${subs.length === 1 ? "" : "s"}. It should appear within a few seconds.` };
}
