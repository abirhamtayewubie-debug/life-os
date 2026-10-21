// Signs up a throwaway user, loads sample data, then screenshots pages.
// Usage: node scripts/shots-live.mjs http://localhost:3200 prefix /tasks /calendar ...
import { chromium } from "@playwright/test";
const [,, base, prefix, ...paths] = process.argv;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const setup = await browser.newContext();
const p = await setup.newPage();
await p.goto(base + "/signup");
await p.getByLabel("Name").fill("Ab");
await p.getByLabel("Email").fill(`shots-${Date.now()}@example.test`);
await p.getByLabel("Password").fill("correct horse battery staple");
await p.getByRole("button", { name: "Create account" }).click();
await p.waitForURL(base + "/");
await p.goto(base + "/settings#data", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Load sample data" }).click();
await p.getByText(/Loaded \d+ sample records/).waitFor().catch(async (e) => { await p.screenshot({ path: "/tmp/claude-0/shots/debug.png" }); throw e; });
const state = await setup.storageState();
await setup.close();
for (const [w, h, tag, scheme] of [[1440, 1000, "desk", "light"], [1440, 1000, "desk-dark", "dark"], [390, 844, "mobile", "light"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, storageState: state });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
  for (const path of paths) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const name = `${prefix}-${tag}-${path === "/" ? "home" : path.replace(/[/?=&]/g, "_")}.png`;
    await page.screenshot({ path: `/tmp/claude-0/shots/${name}`, fullPage: tag !== "desk-dark" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) errors.push(`${tag} ${path}: horizontal overflow`);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no errors");
