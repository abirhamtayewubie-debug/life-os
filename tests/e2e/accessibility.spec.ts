import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Automated WCAG 2.1 A/AA scan of every screen with sample data loaded, in
 * light and dark themes, plus a few keyboard checks. Automated checks find
 * roughly a third of real issues; docs/ACCESSIBILITY.md lists what was
 * reviewed by hand.
 */

const password = "correct horse battery staple";
const PAGES = ["/", "/assistant", "/calendar", "/tasks", "/goals", "/habits", "/finance", "/health", "/health?tab=sleep", "/work", "/learning", "/reflection", "/relationships", "/admin", "/wheel", "/reports", "/knowledge", "/integrations", "/settings"];

async function setup(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ab");
  await page.getByLabel("Email").fill(`a11y-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  await page.goto("/settings#data");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Load sample data" }).click();
  await expect(page.getByText(/Loaded \d+ sample records/)).toBeVisible({ timeout: 30_000 });
}

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("signed-out pages pass an automated WCAG 2.1 AA scan", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    expect(await scan(page), path).toEqual([]);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`every screen passes an automated WCAG 2.1 AA scan (${scheme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page);
    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      for (const v of await scan(page)) problems.push(`${path}: ${v}`);
    }
    expect(problems).toEqual([]);
  });
}

test("keyboard: skip link, command palette and dialogs", async ({ page }) => {
  await setup(page);
  await page.goto("/tasks");
  await page.waitForLoadState("networkidle");

  // The first Tab lands on "Skip to content", which moves focus to the main region.
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);

  // ⌘K / Ctrl+K opens search with focus in the input; Escape closes it.
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog");
  await expect(search).toBeVisible();
  await expect(search.getByRole("combobox").or(search.getByRole("textbox")).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();

  // Dialogs trap focus and give it back to the button that opened them.
  await page.goto("/settings#data");
  await page.waitForLoadState("networkidle");
  const opener = page.getByRole("button", { name: "Delete account…" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
