import { defineConfig, devices } from "@playwright/test";

const defaultLocalE2EHost = "local-e2e.gainforest.app";
const defaultLocalE2EPort = 3201;
const port = Number(process.env.E2E_PORT ?? defaultLocalE2EPort);
const defaultLocalE2EBaseURL = `https://${defaultLocalE2EHost}`;
const baseURL = process.env.E2E_BASE_URL ?? process.env.E2E_APP_URL ?? defaultLocalE2EBaseURL;
const shouldStartLocalE2EServer =
  process.env.E2E_SKIP_WEB_SERVER !== "1" &&
  new URL(baseURL).hostname === defaultLocalE2EHost;

process.env.E2E_BASE_URL ??= baseURL;
process.env.E2E_PORT ??= String(port);
process.env.NEXT_PUBLIC_AUTH_PROVIDER ??= "certs";

function getConfiguredWorkers(): number | undefined {
  const configured = process.env.E2E_WORKERS;
  if (configured) {
    const workers = Number.parseInt(configured, 10);
    return Number.isFinite(workers) && workers > 0 ? workers : undefined;
  }

  return 1;
}

const desktopChrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./e2e/tests",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "./reports/e2e/artifacts",
  timeout: 120_000,
  fullyParallel: false,
  workers: getConfiguredWorkers(),
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./reports/e2e/html", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: process.env.VERCEL_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_SECRET }
      : {},
  },
  webServer: shouldStartLocalE2EServer
    ? {
        command: "node scripts/e2e-local-server.mjs",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        ignoreHTTPSErrors: true,
      }
    : undefined,
  projects: [
    {
      name: "auth.setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "disposable-checklist",
      dependencies: ["auth.setup"],
      testMatch: /disposable-checklist\.spec\.ts/,
      use: { ...desktopChrome },
    },
  ],
});
