import "server-only";
import webpush from "web-push";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body?: string; url?: string; tag?: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function allowTestEndpoints(): boolean {
  return process.env.PUSH_TEST_ENDPOINTS === "1";
}

/**
 * Sends one notification. The payload is encrypted for the device (RFC 8291),
 * so the browser vendor's push service carries it without being able to read it.
 */
export async function sendPush(target: PushTarget, payload: PushPayload): Promise<PushResult> {
  if (!pushConfigured()) return { ok: false, gone: false, error: "Notifications aren't set up on the server." };
  try {
    // web-push builds the encrypted body and VAPID headers; we send it ourselves
    // so the timeout is ours and a local test service can be used.
    const req = webpush.generateRequestDetails(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT || "mailto:owner@example.invalid",
          publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
        TTL: 60 * 60,
        urgency: "high",
      },
    );
    const res = await fetch(req.endpoint, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      body: req.body ? new Uint8Array(req.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return { ok: false, gone: true, error: "This device turned notifications off." };
    if (!res.ok) return { ok: false, gone: false, error: `Push service answered ${res.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, gone: false, error: "Couldn't reach the push service." };
  }
}
