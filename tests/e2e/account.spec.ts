import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

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

test("pages are served with a strict, per-request security policy", async ({ request }) => {
  const a = await request.get("/login");
  const b = await request.get("/login");
  const csp = a.headers()["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toEqual(b.headers()["content-security-policy"]); // fresh nonce each time
  expect(a.headers()["x-frame-options"]).toBe("DENY");
  expect(a.headers()["strict-transport-security"]).toContain("max-age=");
  expect(a.headers()["x-powered-by"]).toBeUndefined();
});

test("health check answers without signing in and reveals nothing", async ({ request }) => {
  const res = await request.get("/healthz", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, database: "ok" });
  expect(Object.keys(body).sort()).toEqual(["database", "ms", "ok"]);
});

test("export everything, then delete the account and all of its data", async ({ page, browser }) => {
  // Someone else's data must never appear in this person's export.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUp(p2, unique(), "Other");
  await p2.goto("/tasks");
  await p2.waitForLoadState("networkidle");
  await p2.getByRole("button", { name: "New task" }).first().click();
  await p2.getByLabel("Title").fill("Other person's secret task");
  await p2.getByRole("button", { name: "Add task" }).click();
  await expect(p2.getByText("Other person's secret task")).toBeVisible();

  const email = unique();
  await signUp(page, email);
  await page.goto("/settings#data");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText(/Loaded \d+ sample records/)).toBeVisible({ timeout: 30_000 });

  // JSON: every table, only my rows.
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "All data (JSON)" }).click()]);
  expect(json.suggestedFilename()).toMatch(/^life-os-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(readFileSync(await json.path(), "utf8"));
  expect(data.format).toBe("life-os-export");
  expect(data.account.email).toBe(email);
  expect(data.tables).not.toHaveProperty("integration_credentials");
  expect(data.counts.tasks).toBeGreaterThan(0);
  expect(data.counts.transactions).toBeGreaterThan(0);
  const userIds = new Set(Object.values(data.tables as Record<string, { user_id?: string }[]>).flat().map((r) => r.user_id).filter(Boolean));
  expect([...userIds]).toEqual([data.account.id]);
  expect(JSON.stringify(data)).not.toContain("Other person's secret task");
  expect(data.tables.notes[0]).not.toHaveProperty("search");

  // CSV zip and a single table.
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "All tables (CSV, zipped)" }).click()]);
  const bytes = readFileSync(await zip.path());
  expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(bytes.toString("latin1")).toContain("tasks.csv");

  await page.getByLabel("One table as CSV").selectOption("habits");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download CSV" }).click()]);
  const text = readFileSync(await csv.path(), "utf8");
  expect(text.split("\r\n")[0]).toContain("id,user_id");
  expect(text).toContain("sample");

  // Deleting needs the right password and the typed phrase.
  await page.getByRole("button", { name: "Delete account…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  const confirm = dialog.getByRole("button", { name: "Delete everything" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Your password").fill("not my password at all");
  await dialog.getByLabel(/to confirm/).fill("delete my account");
  await confirm.click();
  await expect(dialog.getByText("That password didn't match.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings/);

  await dialog.getByLabel("Your password").fill(password);
  await confirm.click();
  await page.waitForURL(/\/login\?deleted=1/);
  await expect(page.getByRole("paragraph").filter({ hasText: "Your account and everything in it were deleted." })).toBeVisible();

  // Gone: can't sign in, can't export, and the other person still has their data.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password combination didn't work.")).toBeVisible();
  const res = await page.request.get("/settings/export?format=json", { maxRedirects: 0 });
  expect(res.status()).toBe(307);

  await p2.reload();
  await expect(p2.getByText("Other person's secret task")).toBeVisible();
  await other.close();
});
