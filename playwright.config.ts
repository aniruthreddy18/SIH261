import { defineConfig, devices } from "@playwright/test";

// E2E runs against an isolated, freshly seeded database and storage directory on port 3100.
// The periodic alert sweep is off so the alerts the tests see come only from the seed and explicit sweeps.
const env = { DATABASE_URL: "file:./e2e.db", STORAGE_DIR: "./storage-e2e", DEMO_MODE: "true", PORT: "3100", NEXT_DIST_DIR: ".next-e2e", DEMO_DATASET: "full", ALERT_SWEEP_INTERVAL_MINUTES: "0" };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // A production build: no on-demand compilation, so pages are interactive as soon as they load
    // (the dev server's compile races made clicks occasionally land on non-hydrated pages).
    command: "npx tsx scripts/reset-db.ts && npx next build && npx next start -p 3100",
    url: "http://localhost:3100/login",
    timeout: 600_000,
    reuseExistingServer: false,
    env,
  },
});
