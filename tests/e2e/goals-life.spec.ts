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

const dlg = (page: Page) => page.getByRole("dialog");
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("goals, projects and the wheel persist and connect", async ({ page }) => {
  await signUp(page, unique());

  /* Goals ------------------------------------------------------------------ */
  await open(page, "/goals");
  await expect(page.getByText("No goals yet")).toBeVisible();
  await page.getByRole("button", { name: "New goal" }).click();
  await dlg(page).getByLabel("Goal").fill("A healthy, generous life");
  await dlg(page).getByLabel("Horizon").selectOption("vision");
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(toast(page, /added|saved/i)).toBeVisible();

  await page.getByRole("button", { name: "Sub-goal under A healthy, generous life" }).click({ force: true });
  await dlg(page).getByLabel("Goal").fill("Run a 10K this year");
  await expect(dlg(page).getByLabel("Part of")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByRole("treeitem").filter({ hasText: "Run a 10K this year" })).toHaveAttribute("aria-level", "2");

  // Validation: an empty title is refused.
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByRole("button", { name: "Add goal" }).click();
  await expect(dlg(page).getByText(/title|name/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // A task linked to the goal is counted on it.
  await open(page, "/tasks");
  await page.getByRole("button", { name: "New task" }).first().click();
  await dlg(page).getByLabel("Title").fill("Book a running coach");
  await dlg(page).getByLabel("Goal").selectOption({ label: "Run a 10K this year" });
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(toast(page, /added/i)).toBeVisible();
  await open(page, "/goals");
  await expect(page.getByRole("treeitem").filter({ hasText: "Run a 10K this year" })).toContainText("1 open task");

  /* Projects --------------------------------------------------------------- */
  await open(page, "/work");
  await page.getByRole("button", { name: "New project" }).click();
  await dlg(page).getByLabel("Project").fill("Kitchen renovation");
  await dlg(page).getByLabel("Budget").fill("12000.50");
  await page.getByRole("button", { name: "Add project" }).click();
  await expect(toast(page, /added|created|saved/i)).toBeVisible();
  await open(page, "/work?tab=board");
  // The board starts on every project; pick one to add tasks to it.
  await page.getByLabel("Project", { exact: true }).selectOption({ label: "Kitchen renovation" });
  await page.getByLabel("Add a task to To do").fill("Measure the walls");
  await page.getByLabel("Add a task to To do").press("Enter");
  const card = page.getByRole("region", { name: "To do column" }).getByRole("button", { name: "Measure the walls" });
  await expect(card).toBeVisible();
  // Move it with the card menu (keyboard and touch friendly) and check it stuck.
  await page.getByRole("button", { name: "Move Measure the walls" }).click();
  await page.getByRole("menuitem", { name: "Doing" }).click();
  await expect(page.getByRole("region", { name: "Doing column" }).getByRole("button", { name: "Measure the walls" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Doing column" }).getByRole("button", { name: "Measure the walls" })).toBeVisible();
  // Blocked is the same task status the Tasks screen shows.
  await page.getByRole("button", { name: "Move Measure the walls" }).click();
  await page.getByRole("menuitem", { name: "Blocked" }).click();
  await expect(page.getByRole("region", { name: "Blocked column" }).getByRole("button", { name: "Measure the walls" })).toBeVisible();
  // The card opens the task in place, with subtasks.
  await page.getByRole("region", { name: "Blocked column" }).getByRole("button", { name: "Measure the walls" }).click();
  await dlg(page).getByLabel("New subtask").fill("Kitchen wall");
  await dlg(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(dlg(page).getByText("Kitchen wall")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Blocked column" }).getByTitle("Subtasks done")).toContainText("0/1");
  // All projects, as a list.
  await open(page, "/work?tab=list");
  await expect(page.getByLabel("Status of Measure the walls")).toHaveValue("waiting");
  await open(page, "/tasks?view=all");
  await expect(page.getByRole("listitem").filter({ hasText: "Measure the walls" }).first()).toContainText("Blocked");

  /* Wheel of Life ---------------------------------------------------------- */
  await open(page, "/wheel");
  await page.getByRole("button", { name: "Start with 10 common areas" }).click();
  await page.getByRole("button", { name: "Rate your areas" }).click();
  await dlg(page).getByLabel("Health & fitness: now").selectOption("6");
  await dlg(page).getByLabel("Health & fitness: want").selectOption("9");
  await dlg(page).getByLabel("Finances: now").selectOption("4");
  await page.getByRole("button", { name: "Save check-in" }).click();
  await expect(toast(page, /saved/i)).toBeVisible();
  await page.reload();
  const table = page.getByRole("table");
  await expect(table.getByRole("row").filter({ hasText: "Health & fitness" })).toContainText("6");
  await expect(table.getByRole("row").filter({ hasText: "Health & fitness" })).toContainText("3"); // gap 9 − 6
  // Unrated areas show as not rated, not as zero.
  await expect(page.getByRole("img", { name: /Career & work not rated/ })).toBeVisible();
});

test("journal, knowledge base, learning, relationships and admin", async ({ page, browser }) => {
  await signUp(page, unique());

  /* Journal (private) ----------------------------------------------------- */
  await open(page, "/reflection");
  await expect(page.getByText("Your journal is empty")).toBeVisible();
  await page.getByRole("button", { name: "New entry" }).click();
  await dlg(page).getByLabel("Type").selectOption("gratitude");
  await dlg(page).getByLabel("Entry").fill("Grateful for the long walk with Hana by the river.");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(toast(page, "private journal")).toBeVisible();
  await page.getByLabel("Search your journal").fill("river");
  await page.getByLabel("Search your journal").press("Enter");
  await expect(page.getByText("1 entry matches")).toBeVisible();
  await page.getByLabel("Search your journal").fill("volcano");
  await page.getByLabel("Search your journal").press("Enter");
  await expect(page.getByText("Nothing matches that search")).toBeVisible();

  /* Knowledge base with [[links]] ------------------------------------------ */
  await open(page, "/knowledge");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await dlg(page).getByLabel("Title").fill("Tile suppliers");
  await dlg(page).getByLabel("Note").fill("Three quotes so far.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(toast(page, "Note added")).toBeVisible();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await dlg(page).getByLabel("Title").fill("Kitchen plan");
  await dlg(page).getByLabel("Note").fill("Pick tiles from [[Tile suppliers]] and ask about [[Grout colours]].");
  await dlg(page).getByLabel("Tags").fill("home, reno");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("heading", { name: "Kitchen plan" })).toBeVisible();
  await expect(page.getByText("#reno")).toBeVisible();
  // Follow the link; the target lists the backlink.
  await page.getByRole("button", { name: "Tile suppliers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tile suppliers" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Linked from" }).getByRole("button", { name: "Kitchen plan" })).toBeVisible();
  // A link to a missing note offers to create it.
  await page.getByRole("button", { name: "Kitchen plan" }).first().click();
  await page.getByRole("button", { name: "Grout colours" }).click();
  await expect(dlg(page).getByLabel("Title")).toHaveValue("Grout colours");
  await page.getByRole("button", { name: "Cancel" }).click();
  // Full-text search over note bodies.
  await page.getByLabel("Search notes").fill("quotes");
  await page.getByLabel("Search notes").press("Enter");
  await expect(page.getByText("1 note matches")).toBeVisible();

  /* Learning ---------------------------------------------------------------- */
  await open(page, "/learning");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await dlg(page).getByLabel("Title").fill("Atomic Habits");
  await dlg(page).getByLabel("Status").selectOption("in_progress");
  await dlg(page).getByLabel("Progress %").fill("150");
  await dlg(page).getByRole("button", { name: "Add" }).click();
  await expect(dlg(page).getByText("Use 0 to 100")).toBeVisible();
  await dlg(page).getByLabel("Progress %").fill("20");
  await dlg(page).getByRole("button", { name: "Add" }).click();
  await expect(page.getByLabel("Progress for Atomic Habits, percent")).toHaveValue("20");

  /* Relationships ----------------------------------------------------------- */
  await open(page, "/relationships");
  await page.getByRole("button", { name: "Add person" }).click();
  await dlg(page).getByLabel("Name").fill("Hana");
  await dlg(page).getByLabel("Be in touch every").fill("7");
  await dlg(page).getByLabel("Private notes").fill("Loves long walks.");
  await page.getByRole("button", { name: "Add person", exact: true }).last().click();
  await expect(dlg(page).getByRole("heading", { name: /Hana/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No contact logged yet")).toBeVisible();
  await page.getByRole("button", { name: /^Hana/ }).last().click();
  await dlg(page).getByLabel("How").selectOption("visit");
  await dlg(page).getByLabel("Note").fill("Walk by the river");
  await dlg(page).getByRole("button", { name: "Log" }).click();
  await expect(dlg(page).getByText("Walk by the river")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No contact logged yet")).toHaveCount(0);

  /* Home & Admin ------------------------------------------------------------ */
  await open(page, "/admin");
  await page.getByRole("button", { name: "Renewal or job" }).click();
  await dlg(page).getByLabel("Title").fill("Car insurance");
  await dlg(page).getByRole("button", { name: "Add" }).click();
  await expect(dlg(page).getByText("Add the date it's due")).toBeVisible();
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await dlg(page).getByLabel("Expires / due").fill(soon);
  await dlg(page).getByLabel("Renews every").fill("12");
  await dlg(page).getByRole("button", { name: "Add" }).click();
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.getByText("Car insurance")).toBeVisible();
  await attention.getByRole("button", { name: "Renewed" }).click();
  await expect(toast(page, "Renewed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Coming up later" }).getByText("Car insurance")).toBeVisible();

  /* Another account sees none of it ----------------------------------------- */
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUp(p2, unique(), "Bob");
  for (const [path, empty] of [["/reflection", "Your journal is empty"], ["/knowledge", "No notes yet"], ["/relationships", "No people yet"], ["/admin", "Nothing tracked yet"]] as const) {
    await open(p2, path);
    await expect(p2.getByText(empty)).toBeVisible();
  }
  await other.close();
});
