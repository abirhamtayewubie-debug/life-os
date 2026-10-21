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

async function search(page: Page, q: string) {
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Search tasks, events, habits and actions…");
  await input.fill(q);
  return page.getByRole("dialog");
}

test("tasks, reminders, calendar, habits and search persist per user", async ({ page, browser }) => {
  const email = unique();
  await signUp(page, email);

  /* Tasks ---------------------------------------------------------------- */
  await page.goto("/tasks");
  await expect(page.getByText("Nothing due today")).toBeVisible();
  await page.getByRole("button", { name: "New task" }).first().click();
  await dlg(page).getByLabel("Title").fill("Draft café proposal");
  await dlg(page).getByLabel("Priority").selectOption({ label: "High" });
  await dlg(page).getByLabel("Tags").fill("client, writing");
  await dlg(page).getByLabel("Estimate (min)").fill("90");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added.").or(page.getByText(/added/i)).first()).toBeVisible();
  const row = page.getByRole("button", { name: /Draft café proposal/ });
  await expect(row).toBeVisible();

  // Validation: empty title is refused with a message.
  await page.getByRole("button", { name: "New task" }).first().click();
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Give the task a title")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Subtask + reminder in the past (today 00:00) so it's already due.
  await row.click();
  await dlg(page).getByLabel("New subtask").fill("Collect brand assets");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Collect brand assets")).toBeVisible();
  await dlg(page).getByLabel("Reminder time").fill("00:00");
  await page.getByRole("button", { name: "Remind me" }).click();
  await expect(page.getByText(/Reminder set/)).toBeVisible();
  await page.keyboard.press("Escape");

  // The in-app alert shows on load because the reminder is due.
  await page.reload();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Draft café proposal" })).toBeVisible({ timeout: 15_000 });
  const panel = page.getByRole("complementary", { name: "Reminders" });
  await expect(panel.getByText("Draft café proposal")).toBeVisible();
  await panel.getByRole("button", { name: "1 hour" }).click();
  await expect(page.getByText(/Snoozed/i).first()).toBeVisible();

  // Repeating task: completing it creates the next one.
  await page.getByRole("button", { name: "New task" }).first().click();
  await dlg(page).getByLabel("Title").fill("Water the plants");
  await dlg(page).getByLabel("Repeat").selectOption({ label: "Every day" });
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("checkbox", { name: "Mark “Water the plants” done" }).click();
  await expect(page.getByText(/Done\. Next one is due \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await page.goto("/tasks?view=upcoming");
  await expect(page.getByRole("button", { name: /Water the plants/ })).toBeVisible();
  await expect(page.getByText("Tomorrow").first()).toBeVisible();

  /* Calendar --------------------------------------------------------------- */
  await page.goto("/calendar?view=agenda");
  // Tasks with due dates show on the calendar too.
  await expect(page.getByRole("link", { name: /Draft café proposal/ })).toBeVisible();
  await page.getByRole("button", { name: "New event" }).first().click();
  await dlg(page).getByLabel("Title").fill("Team sync");
  await dlg(page).getByLabel("Start time").fill("10:00");
  await dlg(page).getByLabel("End time").fill("11:00");
  await dlg(page).getByLabel("Repeat").selectOption({ label: "Every week" });
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Event added.")).toBeVisible();

  await page.getByRole("button", { name: "New event" }).first().click();
  await dlg(page).getByLabel("Title").fill("Dentist");
  await dlg(page).getByLabel("Start time").fill("10:30");
  await dlg(page).getByLabel("End time").fill("11:15");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Event added.")).toBeVisible();

  // Weekly repeat shows on four or five weeks of the agenda; the overlap is flagged.
  await expect(page.getByRole("button", { name: /Team sync/ }).first()).toBeVisible();
  expect(await page.getByRole("button", { name: /Team sync/ }).count()).toBeGreaterThanOrEqual(4);
  await expect(page.getByText("Overlaps").first()).toBeVisible();

  // End before start is refused.
  await page.getByRole("button", { name: /Dentist/ }).click();
  await dlg(page).getByLabel("End time").fill("09:00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("End after the start time")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Block time for a task from its detail view.
  await page.goto("/tasks?view=all");
  await page.getByRole("button", { name: /Draft café proposal/ }).click();
  await page.getByRole("link", { name: "Block time on calendar" }).click();
  await expect(page.getByText("Pick a time to work on")).toBeVisible();
  await page.getByRole("button", { name: "Choose a time" }).click();
  await expect(dlg(page).getByLabel("Title")).toHaveValue("Draft café proposal");
  await dlg(page).getByLabel("Start time").fill("14:00");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByText("Time blocked.")).toBeVisible();
  await expect(page.getByText("Pick a time to work on")).toBeHidden();
  await page.goto(`/calendar?view=agenda`);
  await expect(page.getByRole("button", { name: /14:00.*Draft café proposal|Draft café proposal/ }).first()).toBeVisible();

  /* Habits ----------------------------------------------------------------- */
  await page.goto("/habits");
  await expect(page.getByText("No habits yet")).toBeVisible();
  await page.getByRole("button", { name: "New habit" }).click();
  await dlg(page).getByLabel("Habit").fill("Drink water");
  await page.getByRole("button", { name: "Add habit" }).click();
  await expect(page.getByText("Habit added.")).toBeVisible();
  const todayCell = page.getByRole("button", { name: /: not done$/ }).last();
  await todayCell.click();
  await expect(page.getByText("1 of 1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 of 1")).toBeVisible();

  await page.getByRole("button", { name: "Options for Drink water" }).click();
  await page.getByRole("menuitem", { name: "Pause" }).click();
  await expect(page.getByRole("region", { name: "Paused" }).getByText("Drink water")).toBeVisible();

  /* Search ----------------------------------------------------------------- */
  const dialog = await search(page, "Team");
  await expect(dialog.getByRole("option", { name: /Team sync/ })).toBeVisible();
  await dialog.getByRole("option", { name: /Team sync/ }).click();
  await expect(page).toHaveURL(/\/calendar\?view=day/);

  /* Isolation -------------------------------------------------------------- */
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUp(p2, unique(), "Other");
  await p2.goto("/tasks?view=all");
  await expect(p2.getByText("No open tasks")).toBeVisible();
  await p2.goto("/calendar?view=agenda");
  await expect(p2.getByText("Nothing scheduled in the next 30 days")).toBeVisible();
  await p2.goto("/habits");
  await expect(p2.getByText("No habits yet")).toBeVisible();
  const d2 = await search(p2, "Team");
  // Give the debounced search time to answer, then make sure nothing of user one's leaked.
  await p2.waitForTimeout(1000);
  await expect(d2.getByRole("group", { name: "Records" })).toHaveCount(0);
  await expect(d2.getByRole("option", { name: /Team sync/ })).toHaveCount(0);
  await p2.keyboard.press("Escape");
  // Regression: two accounts can both load sample data (ids must not collide).
  for (const pg of [page, p2]) {
    await pg.goto("/settings#data", { waitUntil: "networkidle" });
    await pg.getByRole("button", { name: "Load sample data" }).click();
    await expect(pg.getByText(/Loaded \d+ sample records/)).toBeVisible();
  }
  await other.close();

  /* Delete habit with confirmation ---------------------------------------- */
  await page.goto("/habits");
  await page.getByRole("button", { name: "Options for Drink water" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete habit" }).click();
  await expect(page.getByText("Habit and its history deleted.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Drink water/ })).toHaveCount(0);
});
