import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against a live app connected to a local Supabase stack:
 *   npx supabase start && npm run build &&
 *   ANTHROPIC_API_KEY=e2e-mock ANTHROPIC_BASE_URL=http://127.0.0.1:3299 PORT=3200 npm start
 * (the assistant spec starts a scripted stand-in for Anthropic on port 3299; nothing is billed)
 * The notifications spec also needs, when the app starts: NEXT_PUBLIC_VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY (any generated pair), PUSH_TEST_ENDPOINTS=1, CRON_SECRET (32+ chars) and
 * SUPABASE_SECRET_KEY (from `npx supabase status`); it runs a stand-in push service on port 3298.
 *   E2E_BASE_URL=http://localhost:3200 npm run test:e2e
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    viewport: { width: 1440, height: 1000 },
  },
});
