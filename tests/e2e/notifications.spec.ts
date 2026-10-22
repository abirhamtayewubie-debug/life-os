import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { fakeDevice, startMockPush } from "./mock-push";

/*
 * Needs the app started with test notification settings (no real push service):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (any generated pair),
 *   PUSH_TEST_ENDPOINTS=1, CRON_SECRET=<32+ chars>, SUPABASE_SECRET_KEY=<local secret key>
 * The browser's push subscription is replaced with a device the test controls.
 */

const password = "correct horse battery staple";
const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret-0123456789abcdef0123456789";
const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
/** Moves a pending retry's time to now, instead of waiting a minute. */
const retryNow = (endpointName: string) => execFileSync("psql", [DB, "-qc",
  `update public.reminder_deliveries d set next_attempt_at = now() from public.push_subscriptions s
   where d.status = 'pending' and s.user_id = d.user_id and s.endpoint like '%/${endpointName}'`]);
const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ab");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

test("reminders reach a device with notifications on, encrypted, once, with retries for failures", async ({ page, context, request }) => {
  // A fresh device name each run: an endpoint can belong to only one account.
  const phone = fakeDevice(3298, `phone-${Date.now()}`);
  const push = await startMockPush([phone]);
  try {
    await context.grantPermissions(["notifications"]);
    // Play the browser's push service: hand back the test device's subscription.
    await page.addInitScript((sub) => {
      let current: unknown = null;
      const fake = { endpoint: sub.endpoint, toJSON: () => sub, unsubscribe: async () => { current = null; return true; } };
      PushManager.prototype.getSubscription = async function () { return current as PushSubscription | null; };
      PushManager.prototype.subscribe = async function () { current = fake; return fake as unknown as PushSubscription; };
    }, phone.subscription);

    await signUp(page);
    await page.goto("/settings#notifications");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Turn on for this device" }).click();
    await expect(toast(page, "Notifications are on for this device.")).toBeVisible({ timeout: 15_000 });
    const devices = page.getByRole("list", { name: "Devices with notifications on" });
    await expect(devices.getByText(/Chrome on Linux/)).toBeVisible();
    await expect(devices.getByText("· this device")).toBeVisible();

    // A test notification arrives encrypted and decrypts on the device.
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect(toast(page, "Sent to 1 of 1 device.")).toBeVisible();
    expect(push.received).toHaveLength(1);
    expect(push.received[0].payload.title).toBe("Test from Life OS");
    expect(push.received[0].headers["content-encoding"]).toBe("aes128gcm");
    expect(push.received[0].headers.authorization).toMatch(/^vapid t=.+, k=.+/);

    // A reminder due now, set to notify devices.
    await page.goto("/tasks");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "New task" }).first().click();
    await page.getByRole("dialog").getByLabel("Title").fill("Pay the contractor");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByRole("button", { name: /^All open/ }).click();
    await page.getByText("Pay the contractor").first().click();
    await page.getByLabel("Reminder time").fill("00:00");
    await expect(page.getByLabel("Also notify my devices")).toBeChecked();
    await page.getByRole("button", { name: "Remind me" }).click();
    await expect(toast(page, /on devices with notifications on/)).toBeVisible();

    // Only the scheduler with the secret can run the sender.
    expect((await request.post("/api/cron/reminders")).status()).toBe(401);
    expect((await request.post("/api/cron/reminders", { headers: { authorization: "Bearer wrong-secret-wrong-secret-wrong-secret" } })).status()).toBe(401);

    const run = async () => (await request.post("/api/cron/reminders", { headers: { authorization: `Bearer ${CRON_SECRET}` } })).json();
    // The push service is down: the delivery waits and is retried, not lost or repeated.
    push.setStatus(phone.name, 503);
    expect(await run()).toMatchObject({ ok: true, queued: 1, sent: 0, retrying: 1 });
    expect(await run()).toMatchObject({ ok: true, queued: 0, sent: 0, retrying: 0 }); // not due again yet
    push.setStatus(phone.name, 201);
    retryNow(phone.name);
    const first = await run();
    expect(first).toMatchObject({ ok: true, sent: 1 });
    const reminder = push.received.find((m) => m.payload.title === "Pay the contractor");
    expect(reminder?.payload.url).toMatch(/^\/tasks\?open=[0-9a-f-]{36}$/);

    // Running again sends nothing twice.
    const second = await run();
    expect(second).toMatchObject({ ok: true, queued: 0, sent: 0 });
    expect(push.received.filter((m) => m.payload.title === "Pay the contractor")).toHaveLength(1);

    // A device that went away is dropped.
    push.setStatus(phone.name, 410);
    await page.goto("/settings#notifications");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Send a test" }).click();
    await expect(toast(page, /didn't accept it/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("list", { name: "Devices with notifications on" })).toHaveCount(0);
  } finally {
    await push.close();
  }
});
