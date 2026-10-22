import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";

const password = "correct horse battery staple";
const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
const xml = readFileSync(join(__dirname, "../fixtures/apple-health-export.xml"));

/** A zip shaped like the Health app's export.zip (deflated apple_health_export/export.xml). */
function exportZip(): Buffer {
  const name = Buffer.from("apple_health_export/export.xml");
  const data = deflateRawSync(xml);
  const crc = crc32(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(xml.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(xml.length, 24); central.writeUInt16LE(name.length, 28);
  const cdOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

test("Apple Health export: read on the device, previewed, imported once with honest sources", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ab");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");

  await page.goto("/integrations");
  await expect(page.getByRole("heading", { name: /Apple Health/ })).toBeVisible();
  await page.getByRole("button", { name: "Import an export" }).click();
  const dialog = page.getByRole("dialog", { name: "Import from Apple Health" });
  await dialog.getByLabel("Health export (.zip or .xml)").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: exportZip() });
  await expect(dialog.getByText("Found in export.zip, 2026-10-01 to 2026-10-13:")).toBeVisible();
  for (const line of ["Weight: 2", "Body fat: 1", "Resting heart rate: 1", "Sleep (nights): 2", "Workouts: 2"]) await expect(dialog.getByText(line)).toBeVisible();
  await expect(dialog.getByText("Values outside the range this app accepts: 1")).toBeVisible();

  // Leave body fat out.
  await dialog.getByRole("checkbox", { name: "Body fat: 1" }).uncheck();
  await dialog.getByRole("button", { name: "Add 7 items" }).click();
  await expect(toast(page, "Added 3 measurements, 2 nights and 2 workouts.")).toBeVisible();

  // The unzipped export.xml again, everything ticked: only body fat is new.
  await dialog.getByLabel("Health export (.zip or .xml)").setInputFiles({ name: "export.xml", mimeType: "text/xml", buffer: xml });
  await dialog.getByRole("button", { name: "Add 8 items" }).click();
  await expect(toast(page, "Added 1 measurements, 0 nights and 0 workouts; 7 were already here.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByText(/Last import .*\. 7 device-recorded entries in Life OS\./)).toBeVisible();

  // Typed into the Health app → "Imported"; recorded by a device → "Device".
  await page.goto("/health?tab=workouts");
  const row = (name: string) => page.locator("div, li").filter({ has: page.getByRole("button", { name }) }).last();
  const running = row("Edit Running on 2026-10-12");
  await expect(running.getByText("Device")).toBeVisible();
  const strength = row("Edit Strength training on 2026-10-13");
  await expect(strength.getByText("Imported")).toBeVisible();
  await page.goto("/sleep");
  await expect(page.getByText("Device").first()).toBeVisible();
});
