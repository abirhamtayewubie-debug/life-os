import { expect, test, type Page } from "@playwright/test";
import { startMockAnthropic, type SeenRequest } from "./mock-anthropic";

/*
 * Needs the app started against the scripted mock (no real key, no spending):
 *   ANTHROPIC_API_KEY=e2e-mock ANTHROPIC_BASE_URL=http://127.0.0.1:3299 PORT=3200 npm start
 */

const password = "correct horse battery staple";
const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

async function signUp(page: Page, email: string, name = "Ab") {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function ask(page: Page, text: string) {
  const box = page.getByLabel("Message the assistant");
  await box.fill(text);
  await box.press("Enter");
}

let mock: { seen: SeenRequest[]; close: () => Promise<void> };
test.beforeAll(async () => { mock = await startMockAnthropic(); });
test.afterAll(async () => { await mock.close(); });

test("assistant: off by default, reads only shared areas, and changes nothing until confirmed", async ({ page }) => {
  await signUp(page, unique());

  /* Off until switched on ------------------------------------------------- */
  await open(page, "/assistant");
  await expect(page.getByText("Not connected yet")).toHaveCount(0); // the server has a key in this run
  await expect(page.getByText("The assistant is switched off")).toBeVisible();
  expect(mock.seen).toHaveLength(0);

  await open(page, "/settings#assistant");
  await page.getByLabel("Use the assistant").click();
  const reads = page.getByRole("group", { name: "What it may read" });
  await reads.getByLabel("Tasks", { exact: true }).click();
  await reads.getByLabel("Reports", { exact: true }).click();
  await page.getByRole("button", { name: "Save assistant settings" }).click();
  await expect(toast(page, "Assistant settings saved.")).toBeVisible();

  /* A suggestion waits for confirmation ----------------------------------- */
  await open(page, "/assistant");
  await ask(page, "remind me to call Abebe");
  await expect(page.getByText("Add task “Call Abebe”")).toBeVisible();
  await expect(page.getByText("Waiting for you")).toBeVisible();
  await expect(page).toHaveURL(/\/assistant\?c=/);
  await open(page, "/tasks");
  await expect(page.getByRole("button", { name: /^All open/ })).toHaveText("All open"); // nothing created yet
  await page.getByRole("button", { name: /^All open/ }).click();
  await expect(page.getByText("Call Abebe")).toHaveCount(0);

  await page.goBack();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(toast(page, "Added from the assistant's suggestion")).toBeVisible();
  await expect(page.getByText("Confirmed")).toBeVisible();

  /* Answers come from tools and link to records --------------------------- */
  await ask(page, "What's due?");
  const link = page.getByRole("link", { name: "Call Abebe", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /^\/tasks\?open=[0-9a-f-]{36}$/);
  await expect(page.getByText("Read 1 task")).toBeVisible();

  /* Unshared areas aren't offered ------------------------------------------ */
  await ask(page, "How is my money?");
  await expect(page.getByText("Finance isn't shared with me")).toBeVisible();

  /* Declining leaves no trace in the data --------------------------------- */
  await ask(page, "remind me to buy cement");
  await expect(page.getByText("Add task “Buy cement”")).toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(toast(page, "Declined. Nothing was changed.")).toBeVisible();
  await open(page, "/tasks");
  await page.getByRole("button", { name: /^All open/ }).click();
  await expect(page.getByText("Call Abebe")).toBeVisible();
  await expect(page.getByText("Buy cement")).toHaveCount(0);

  /* Briefing and report reading -------------------------------------------- */
  await open(page, "/assistant");
  await page.getByRole("button", { name: "Write it" }).click();
  await expect(toast(page, "Briefing written.")).toBeVisible();
  await expect(page.getByText("Nothing overdue.")).toBeVisible();
  await expect(page.getByText(/Written by Haiku 5\.5 at/)).toBeVisible();

  await open(page, "/reports?period=weekly");
  await page.getByRole("button", { name: "Save snapshot" }).click();
  await expect(toast(page, /Snapshot saved/)).toBeVisible();
  await page.getByRole("button", { name: "Write a reading" }).click();
  await expect(toast(page, "Written by Haiku 5.5.")).toBeVisible();
  await expect(page.getByText("A steady week, based on the saved counts.")).toBeVisible();
  await expect(page.getByText(/^Written by Haiku 5\.5 on/)).toBeVisible();

  /* What was actually sent ------------------------------------------------- */
  for (const r of mock.seen) {
    expect(r.headers["x-api-key"]).toBe("e2e-mock");
    expect(r.body.model).toBe("claude-haiku-5-5");
    for (const t of r.body.tools ?? []) expect(["list_tasks", "propose_task", "propose_complete_task", "get_report"]).toContain(t.name);
  }
  const chat = mock.seen.filter((r) => r.body.tools).map((r) => ({ ...r, system: r.body.system as { text: string; cache_control?: unknown }[] }));
  expect(chat.length).toBeGreaterThan(0);
  for (const r of chat) expect(r.system[0].cache_control).toEqual({ type: "ephemeral" });
  // Replies are replayed as returned, thinking signature included.
  expect(JSON.stringify(chat[chat.length - 1].body.messages)).toContain("mock-signature");
  // The confirmed suggestion is reported back on the next turn.
  expect(chat.some((r) => r.system[1].text.includes('confirmed "Add task “Call Abebe”"'))).toBe(true);

  /* The monthly budget stops it ------------------------------------------- */
  await open(page, "/settings#assistant");
  await page.getByLabel("Monthly budget (USD)").fill("0");
  await page.getByRole("button", { name: "Save assistant settings" }).click();
  await expect(toast(page, "Assistant settings saved.")).toBeVisible();
  const before = mock.seen.length;
  await open(page, "/assistant");
  await ask(page, "What's due?");
  await expect(toast(page, /budget \(\$0\.00\) is used up/)).toBeVisible();
  expect(mock.seen.length).toBe(before);
});
