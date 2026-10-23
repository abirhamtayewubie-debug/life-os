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

test("unauthenticated visitors are sent to sign in", async ({ page }) => {
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/login\?next=%2Ffinance/);
});

test("wrong password gets a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("not-the-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password combination didn't work.")).toBeVisible();
});

test("an unconfirmed email is told to confirm, but only with the right password", async ({ page, request }) => {
  // Needs SUPABASE_SECRET_KEY to create a user whose email isn't confirmed (local projects skip confirmation).
  const key = process.env.SUPABASE_SECRET_KEY;
  test.skip(!key, "needs SUPABASE_SECRET_KEY");
  const email = unique();
  const res = await request.post(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54321"}/auth/v1/admin/users`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
    data: { email, password, email_confirm: false },
  });
  expect(res.ok()).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not-the-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password combination didn't work.")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Confirm your email first/)).toBeVisible();
});

test("the confirmation link works in any browser and signs you in", async ({ page, request }) => {
  const key = process.env.SUPABASE_SECRET_KEY;
  test.skip(!key, "needs SUPABASE_SECRET_KEY");
  const email = unique();
  // The same token Supabase puts in the "Confirm signup" email.
  const res = await request.post(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54321"}/auth/v1/admin/generate_link`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
    data: { type: "signup", email, password },
  });
  expect(res.ok()).toBe(true);
  const { hashed_token } = (await res.json()) as { hashed_token: string };
  await page.goto(`/auth/confirm?token_hash=${hashed_token}&type=email`);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // A used or forged link explains what to do next.
  await page.context().clearCookies();
  await page.goto(`/auth/confirm?token_hash=${hashed_token}&type=email`);
  await expect(page.getByText(/your email may be confirmed already/)).toBeVisible();
});

test("a forgotten password can be reset from the emailed link", async ({ page, request }) => {
  // The request form answers the same way whether or not the email has an account.
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If that email has an account, a reset link is on its way/)).toBeVisible();

  const key = process.env.SUPABASE_SECRET_KEY;
  test.skip(!key, "needs SUPABASE_SECRET_KEY");
  const email = unique();
  await signUp(page, email);
  await page.context().clearCookies();
  // The same token Supabase puts in the "Reset password" email.
  const res = await request.post(`${process.env.SUPABASE_URL ?? "http://127.0.0.1:54321"}/auth/v1/admin/generate_link`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
    data: { type: "recovery", email },
  });
  expect(res.ok()).toBe(true);
  const { hashed_token } = (await res.json()) as { hashed_token: string };
  await page.goto(`/auth/confirm?token_hash=${hashed_token}&type=recovery`);
  await expect(page).toHaveURL(/\/reset-password$/);
  const fresh = "a brand new passphrase here";
  await page.getByLabel("New password").fill(fresh);
  await page.getByLabel("Type it again").fill("something else entirely");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();
  await page.getByLabel("New password").fill(fresh);
  await page.getByLabel("Type it again").fill(fresh);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Your password was changed.")).toBeVisible();

  // The old password no longer works; the new one does.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password combination didn't work.")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(fresh);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");

  // A used reset link says so.
  await page.context().clearCookies();
  await page.goto(`/auth/confirm?token_hash=${hashed_token}&type=recovery`);
  await expect(page.getByText(/That reset link has expired or was already used/)).toBeVisible();
});

test("foundation flow: sign up, sample data, persisted changes, isolation, removal", async ({ page, browser }) => {
  const email = unique();
  await signUp(page, email);

  // A brand-new account shows an honest empty state, not invented data.
  await expect(page.getByText("Your Command Center is empty")).toBeVisible();

  // Load sample data from Settings.
  await page.goto("/settings#data", { waitUntil: "networkidle" }); // click only once hydrated
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText(/Loaded \d+ sample records/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Ab/ })).toBeVisible();
  await expect(page.getByText("Some records on this page are sample data")).toBeVisible();
  const priorities = page.getByRole("region", { name: "Today's priorities" });
  const first = priorities.getByRole("checkbox").first();
  const label = await first.getAttribute("aria-label");
  await first.click();
  await expect(first).toHaveAttribute("aria-checked", "true");

  // Evening review persists.
  await page.getByRole("button", { name: "Evening review" }).click();
  await page.getByLabel("What went well or got done?").fill("Shipped the foundation");
  await page.getByLabel("Priority 1").fill("Plan phase 2");
  await page.getByRole("button", { name: "Mood 4 of 5" }).click();
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("Evening review saved.")).toBeVisible();

  // Customize: hide the Sleep widget and save.
  await page.getByRole("button", { name: "Customize" }).click();
  await page.getByRole("button", { name: "Hide Sleep" }).click();
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText("Layout saved.")).toBeVisible();

  // Everything survives a reload (data persisted server-side).
  await page.reload();
  await expect(page.getByRole("region", { name: "Sleep" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit evening review" })).toBeVisible();
  // The completed task is no longer an open priority.
  if (label) await expect(page.getByRole("checkbox", { name: label })).toHaveCount(0);

  // Hide a module from navigation; persists across reload.
  await page.goto("/settings#modules");
  await page.waitForLoadState("networkidle");
  await page.locator("#mod-finance").click();
  await page.waitForLoadState("networkidle"); // the toggle saves quietly in the background
  await page.reload();
  await expect(page.locator("#mod-finance")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("navigation", { name: "Modules" }).getByRole("link", { name: "Finance" })).toHaveCount(0);

  // A second user sees none of the first user's data.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUp(p2, unique(), "Second");
  await expect(p2.getByText("Your Command Center is empty")).toBeVisible();
  await other.close();

  // Remove sample data; the account returns to empty.
  await page.goto("/settings#data", { waitUntil: "networkidle" }); // click only once hydrated
  await page.getByRole("button", { name: "Remove sample data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove sample data" }).click();
  await expect(page.getByText(/Removed \d+ sample records/)).toBeVisible();
  // Only sample rows are gone: the user's own evening review is kept.
  await page.goto("/");
  await expect(page.getByText("Some records on this page are sample data")).toHaveCount(0);
  await expect(page.getByText("Sample", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit evening review" })).toBeVisible();

  // Sign out ends the session.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
