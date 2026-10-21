import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against a live app connected to a local Supabase stack:
 *   npx supabase start && npm run build && PORT=3200 npm start
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
