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

async function addAccount(page: Page, name: string, currency: string, balance: string) {
  await dlg(page).getByLabel("Account name").fill(name);
  await dlg(page).getByLabel("Currency").selectOption(currency);
  await dlg(page).getByLabel("Starting balance").fill(balance);
  await dlg(page).getByRole("button", { name: "Add account" }).click();
  await expect(dlg(page)).toBeHidden();
}

const row = (page: Page, text: string) => page.getByRole("button").filter({ hasText: text }).first();

test("accounts, transactions, transfers, budgets, bills, rates, import and export persist", async ({ page }) => {
  await signUp(page, unique());
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));

  /* Accounts --------------------------------------------------------------- */
  await open(page, "/finance");
  await expect(page.getByText("Add your first account")).toBeVisible();
  await page.getByRole("button", { name: "Add an account" }).click();
  await addAccount(page, "CBE Current", "ETB", "10000");
  await open(page, "/finance?tab=setup");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await addAccount(page, "Cash", "ETB", "0");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await addAccount(page, "USD Payoneer", "USD", "500");
  await page.getByRole("button", { name: "Add a starter set" }).click();
  await expect(toast(page, /Added 14 categories/)).toBeVisible();

  /* Transactions ---------------------------------------------------------- */
  await open(page, "/finance?tab=transactions");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await dlg(page).getByLabel(/^Amount/).fill("1.234");
  await dlg(page).getByRole("button", { name: "Add transaction" }).click();
  await expect(dlg(page).getByText("ETB has 2 decimal places.")).toBeVisible();
  await dlg(page).getByLabel("Account").selectOption({ label: "CBE Current (ETB)" });
  await dlg(page).getByLabel(/^Amount/).fill("250.50");
  await dlg(page).getByLabel("Category").selectOption({ label: "Groceries" });
  await dlg(page).getByLabel("Description").fill("Shoa supermarket");
  await dlg(page).getByRole("button", { name: "Add transaction" }).click();
  await expect(dlg(page)).toBeHidden();
  await expect(page.getByText("Shoa supermarket")).toBeVisible();
  await expect(page.getByText("-ETB 250.50")).toBeVisible();

  // A transfer moves money without counting as spending.
  await page.getByRole("button", { name: "Transfer" }).click();
  await dlg(page).getByLabel("From").selectOption({ label: "CBE Current (ETB)" });
  await dlg(page).getByLabel("To").selectOption({ label: "Cash (ETB)" });
  await dlg(page).getByLabel(/^Sent/).fill("1000");
  await dlg(page).getByRole("button", { name: "Record transfer" }).click();
  await expect(dlg(page)).toBeHidden();
  await expect(page.getByText("Transfer to Cash")).toBeVisible();
  await expect(page.getByText("Out:").locator("..")).toContainText("ETB 250.50");

  await open(page, "/finance");
  await expect(row(page, "CBE Current")).toContainText("ETB 8,749.50");
  await expect(row(page, "Cash")).toContainText("ETB 1,000.00");

  /* Exchange rates and net worth ------------------------------------------- */
  // A new profile's base currency is USD: ETB can't be counted until there's a rate.
  await expect(page.getByText(/Not included, because there's no rate to USD yet/)).toBeVisible();
  await page.getByRole("button", { name: "Add a rate" }).click();
  await dlg(page).getByLabel("From").selectOption("ETB");
  await dlg(page).getByLabel("To").selectOption("USD");
  await dlg(page).getByLabel(/^Rate \(/).fill("0.008");
  await dlg(page).getByRole("button", { name: "Add rate" }).click();
  await expect(dlg(page)).toBeHidden();
  await expect(page.getByText("$578.00").first()).toBeVisible();
  await expect(page.getByText(/Converted with your rate from \d{4}-\d{2}-\d{2}/).first()).toBeVisible();

  /* Budgets ---------------------------------------------------------------- */
  await open(page, "/finance?tab=budgets");
  await page.getByRole("button", { name: "Create a budget" }).click();
  await dlg(page).getByLabel("Currency").selectOption("ETB");
  await dlg(page).getByLabel("Groceries limit").fill("1000");
  await dlg(page).getByRole("button", { name: "Create budget" }).click();
  await expect(dlg(page)).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Groceries" })).toContainText("ETB 250.50 / ETB 1,000.00");

  /* Bills ------------------------------------------------------------------ */
  await open(page, "/finance?tab=bills");
  await page.getByRole("button", { name: "Add one" }).click();
  await dlg(page).getByLabel("What").fill("Internet");
  await dlg(page).getByLabel("Paid from").selectOption({ label: "CBE Current (ETB)" });
  await dlg(page).getByLabel("Usual amount").fill("1200");
  await dlg(page).getByLabel("Next due").fill(today);
  await dlg(page).getByRole("button", { name: /Add|Save/ }).last().click();
  await expect(dlg(page)).toBeHidden();
  await expect(page.getByText("Due today")).toBeVisible();
  await page.getByRole("button", { name: "Paid" }).click();
  await dlg(page).getByRole("button", { name: "Record payment" }).click();
  await expect(toast(page, /Recorded/)).toBeVisible();
  await expect(page.getByText("Due today")).toBeHidden();

  /* Monthly report --------------------------------------------------------- */
  await open(page, "/finance?tab=report");
  await expect(page.getByText("Spending", { exact: true }).locator("..")).toContainText("ETB 1,450.50");

  /* CSV import (twice: the second time adds nothing) ------------------------ */
  const csv = `Date,Description,Amount\n${today},Coffee,-45.00\n${today},Refund,"1,200.00"\n2099-01-01,Future,-1\n`;
  for (const expected of [/Imported 2 transactions/, /Imported 0 transactions; skipped 2 already imported/]) {
    await open(page, "/finance?tab=transactions");
    await page.getByRole("button", { name: "Import" }).click();
    await dlg(page).getByLabel("Into account").selectOption({ label: "Cash (ETB)" });
    await dlg(page).getByLabel("Statement file (.csv)").setInputFiles({ name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dlg(page).getByText("2 ready to import")).toBeVisible();
    await expect(dlg(page).getByText("Line 4: Date is in the future")).toBeVisible();
    await dlg(page).getByRole("button", { name: "Import 2 rows" }).click();
    await expect(toast(page, expected)).toBeVisible();
  }
  await open(page, "/finance");
  await expect(row(page, "Cash")).toContainText("ETB 2,155.00");

  /* CSV export -------------------------------------------------------------- */
  const res = await page.request.get(`/finance/export?month=${today.slice(0, 7)}`);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body).toContain("Shoa supermarket");
  expect(body).toContain("Groceries");
  expect(body).toContain("imported");

  /* Deleting a transfer removes both sides ---------------------------------- */
  await open(page, "/finance?tab=transactions");
  const transfer = page.locator("div.group").filter({ hasText: "Transfer to Cash" });
  await transfer.hover();
  await transfer.getByRole("button", { name: "Delete transaction" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Transfer to Cash")).toBeHidden();
  await expect(page.getByText("Transfer from CBE Current")).toBeHidden();
  await open(page, "/finance");
  await expect(row(page, "CBE Current")).toContainText("ETB 8,549.50");
});
