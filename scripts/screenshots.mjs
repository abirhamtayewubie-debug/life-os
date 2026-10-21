import { chromium } from "@playwright/test";
const [,, base, prefix, ...paths] = process.argv;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
for (const [w, h, tag, scheme] of [[1440, 1000, "desk", "light"], [1440, 1000, "desk-dark", "dark"], [390, 844, "mobile", "light"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const name = `${prefix}-${tag}-${p === "/" ? "home" : p.replace(/\//g, "")}.png`;
    await page.screenshot({ path: `/tmp/claude-0/shots/${name}`, fullPage: tag !== "desk-dark" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) errors.push(`${tag} ${p}: horizontal overflow`);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no errors");
