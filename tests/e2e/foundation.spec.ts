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
