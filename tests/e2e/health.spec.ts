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

test("check-ins, water, workouts, measurements, sleep and reports persist", async ({ page }) => {
  await signUp(page, unique());

  /* Check-in and water ---------------------------------------------------- */
  await open(page, "/health");
  await expect(page.getByText("No check-in yet today.")).toBeVisible();
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await dlg(page).getByRole("button", { name: "Save check-in" }).click();
  await expect(dlg(page).getByText("Rate at least one of mood, energy or stress")).toBeVisible();
  await dlg(page).getByRole("radio", { name: "4: Good" }).first().click();
  await dlg(page).getByRole("radio", { name: "2: Light" }).click();
  await dlg(page).getByRole("button", { name: "Save check-in" }).click();
  await expect(toast(page, "Check-in saved.")).toBeVisible();
  await expect(page.getByText("/5 · Good")).toBeVisible();

  await page.getByRole("button", { name: "+500 ml" }).click();
  await expect(toast(page, "Added 500 ml.")).toBeVisible();
  await page.getByLabel("Other amount in ml").fill("300");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toast(page, "Added 300 ml.")).toBeVisible();
  await open(page, "/health");
  await expect(page.getByText("0.8 L", { exact: true }).first()).toBeVisible();

  /* Workout with sets ----------------------------------------------------- */
  await open(page, "/health?tab=workouts");
  await expect(page.getByText("No workouts logged")).toBeVisible();
  await page.getByRole("button", { name: "Log a workout" }).click();
  await dlg(page).getByLabel("Activity").fill("Strength");
  await dlg(page).getByLabel("Minutes").fill("40");
  await dlg(page).getByRole("button", { name: "Add sets" }).click();
  await dlg(page).getByLabel("Set 1 exercise").fill("Squat");
  await dlg(page).getByLabel("Set 1 reps").fill("5");
  await dlg(page).getByLabel(/Set 1 weight/).fill("80");
  await dlg(page).getByRole("button", { name: "Another set" }).click();
  await dlg(page).getByLabel("Set 2 exercise").fill("Squat");
  await dlg(page).getByLabel("Set 2 reps").fill("5");
  await dlg(page).getByLabel(/Set 2 weight/).fill("80");
  await dlg(page).getByRole("button", { name: "Save workout" }).click();
  await expect(toast(page, "Workout saved.")).toBeVisible();
  await open(page, "/health?tab=workouts");
  await expect(page.getByText(/Squat 2× \(800 kg moved\)/)).toBeVisible();

  /* Measurements: a typo is refused, a real value is charted -------------- */
  await open(page, "/health?tab=body");
  await page.getByRole("button", { name: "Add a measurement" }).click();
  await dlg(page).getByLabel("Value").fill("820");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(dlg(page).getByText("Use 2 to 400 kg.")).toBeVisible();
  await dlg(page).getByLabel("Value").fill("81.4");
  await dlg(page).getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page, "Saved.")).toBeVisible();
  await open(page, "/health?tab=body");
  await expect(page.getByText("81.4 kg").first()).toBeVisible();

  /* Sleep across midnight; one night per date ----------------------------- */
  await open(page, "/sleep");
  await expect(page.getByText("No sleep logged yet")).toBeVisible();
  await page.getByRole("button", { name: "Log last night" }).first().click();
  await dlg(page).getByLabel("Went to sleep").fill("23:30");
  await dlg(page).getByLabel("Woke up", { exact: true }).fill("06:45");
  await dlg(page).getByRole("radio", { name: "4: Rested" }).click();
  await dlg(page).getByRole("button", { name: "Log night" }).click();
  await expect(toast(page, "Sleep logged.")).toBeVisible();
  await open(page, "/sleep");
  await expect(page.getByText("7h 15m").first()).toBeVisible();
  await page.getByRole("button", { name: "Log a night" }).click();
  await dlg(page).getByRole("button", { name: "Log night" }).click();
  await expect(page.getByText(/already logged/i).first()).toBeVisible();
  await page.keyboard.press("Escape");

  /* Report counts what was logged and saves a snapshot ------------------- */
  await open(page, "/reports?period=daily");
  await expect(page.getByText(/1 of 1 day have something logged/)).toBeVisible();
  const health = page.locator("div").filter({ has: page.getByRole("heading", { name: "Health" }) }).last();
  await expect(health.getByText("7h 15m")).toBeVisible();
  await expect(health.getByText("0.8 L")).toBeVisible();
  await page.getByRole("button", { name: "Save snapshot" }).click();
  await expect(toast(page, /Snapshot saved/)).toBeVisible();
  await open(page, "/reports?period=daily");
  await expect(page.getByRole("button", { name: "Update snapshot" })).toBeVisible();
  await expect(page.getByText(/Snapshot saved/)).toBeVisible();
});
