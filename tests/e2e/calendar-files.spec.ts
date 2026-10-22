import { expect, request as pwRequest, test, type Page } from "@playwright/test";

const password = "correct horse battery staple";
const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Ab");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

/** A calendar file like Google Calendar exports, with events in the next few days. */
function sampleIcs(tag: string) {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN", "X-WR-CALNAME:Work",
    "BEGIN:VEVENT", `UID:${tag}-1@google.com`, `DTSTART:${day(1)}T070000Z`, `DTEND:${day(1)}T080000Z`, `SUMMARY:Design review ${tag}`, "LOCATION:Room 4\\, HQ",
    "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:This is an event reminder", "END:VALARM", "END:VEVENT",
    "BEGIN:VEVENT", `UID:${tag}-2@google.com`, `DTSTART;VALUE=DATE:${day(2)}`, `DTEND;VALUE=DATE:${day(3)}`, `SUMMARY:Holiday ${tag}`, "END:VEVENT",
    "BEGIN:VEVENT", `UID:${tag}-3@google.com`, `DTSTART;TZID=Africa/Addis_Ababa:${day(1)}T180000`, `DTEND;TZID=Africa/Addis_Ababa:${day(1)}T190000`,
    "RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=TU,TH", `SUMMARY:Gym ${tag}`, "END:VEVENT",
    "BEGIN:VEVENT", `UID:${tag}-4@google.com`, `DTSTART:${day(1)}T090000Z`, "RRULE:FREQ=MONTHLY;BYDAY=2TU", `SUMMARY:Board ${tag}`, "END:VEVENT",
    "BEGIN:VEVENT", `UID:${tag}-5@google.com`, "STATUS:CANCELLED", `DTSTART:${day(1)}T090000Z`, "SUMMARY:Cancelled", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

test("calendar files: import once, download, and a private subscribe link that can be replaced and turned off", async ({ page }) => {
  const tag = `t${Date.now()}`;
  await signUp(page);
  await page.goto("/calendar?view=agenda");
  await page.getByRole("button", { name: "Import & export" }).click();
  const dialog = page.getByRole("dialog", { name: "Calendar files" });

  // Import: the file is read in the browser and previewed before anything is saved.
  await dialog.getByLabel("Calendar file (.ics)").setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(sampleIcs(tag)) });
  await expect(dialog.getByText("4 events found in “Work”.")).toBeVisible();
  await expect(dialog.getByText("Repeat rules this app doesn't support (imported as one-off): 1")).toBeVisible();
  await expect(dialog.getByText("Cancelled events: 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 4 events" }).click();
  await expect(toast(page, "Added 4 events.")).toBeVisible();

  // The same file again adds nothing.
  await dialog.getByLabel("Calendar file (.ics)").setInputFiles({ name: "work.ics", mimeType: "text/calendar", buffer: Buffer.from(sampleIcs(tag)) });
  await dialog.getByRole("button", { name: "Add 4 events" }).click();
  await expect(toast(page, "Nothing new: every event in this file is already in your calendar.")).toBeVisible();

  // Download through the signed-in session.
  const dl = await page.request.get("/calendar/export");
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-type"]).toContain("text/calendar");
  const body = await dl.text();
  expect(body).toContain(`SUMMARY:Design review ${tag}`);
  expect(body).toContain("LOCATION:Room 4\\, HQ");
  expect(body).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU,TH");
  expect(body).toContain("DTSTART;TZID=Africa/Addis_Ababa:");

  // Private link: works without signing in, and only with the exact token.
  await dialog.getByRole("button", { name: "Create private link" }).click();
  const url1 = await dialog.getByLabel("Your private link (shown once)").inputValue();
  expect(url1).toMatch(/\/feed\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  const anon = await pwRequest.newContext();
  try {
    const feed = await anon.get(url1);
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain(`SUMMARY:Gym ${tag}`);
    expect((await anon.get(url1.replace(/[A-Za-z0-9_-]{43}\.ics$/, "A".repeat(43) + ".ics"))).status()).toBe(404);

    // Replacing the link turns the old one off.
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "Import & export" }).click();
    await expect(dialog.getByText(/A link is on, created .*No calendar app has read it yet|A calendar app last read it/)).toBeVisible();
    await dialog.getByRole("button", { name: "Replace link" }).click();
    await expect(toast(page, "New link created. The old one no longer works.")).toBeVisible();
    const url2 = await dialog.getByLabel("Your private link (shown once)").inputValue();
    expect(url2).not.toBe(url1);
    expect((await anon.get(url1)).status()).toBe(404);
    expect((await anon.get(url2)).status()).toBe(200);

    await dialog.getByRole("button", { name: "Turn off link" }).click();
    await expect(toast(page, "Link turned off.")).toBeVisible();
    expect((await anon.get(url2)).status()).toBe(404);
  } finally {
    await anon.dispose();
  }

  // Imported events show in the calendar and can be edited like your own.
  await page.keyboard.press("Escape");
  await page.goto("/calendar?view=agenda");
  await page.getByRole("button", { name: new RegExp(`Design review ${tag}`) }).first().click();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();
});
