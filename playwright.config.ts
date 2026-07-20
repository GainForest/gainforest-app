import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    process.env[key] ??= rawValue.replace(/^["']|["']$/g, "");
  }
}

loadDotEnvFile(resolve(process.cwd(), ".env.local"));
loadDotEnvFile(resolve(process.cwd(), "e2e/.env"));

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

const authBaseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL?.trim();
if (authBaseUrl) {
  process.env.NEXT_PUBLIC_AUTH_BASE_URL = authBaseUrl.replace(/\/$/, "");
}
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
      name: "test-registry",
      testMatch: /test-registry\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "auth.setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "user-onboarding",
      dependencies: ["auth.setup"],
      testMatch: /user-onboarding\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "profile-edit",
      dependencies: ["user-onboarding"],
      testMatch: /profile-edit\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "organization-onboarding",
      dependencies: ["profile-edit"],
      testMatch: /organization-onboarding\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "sites",
      dependencies: ["organization-onboarding"],
      testMatch: /sites\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "observations",
      dependencies: ["sites"],
      testMatch: /observations\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "projects",
      dependencies: ["observations"],
      testMatch: /projects\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "cert-create",
      dependencies: ["projects"],
      testMatch: /cert-create\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "audio-recordings",
      dependencies: ["cert-create"],
      testMatch: /audio-recordings\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "audiomoth-upload",
      dependencies: ["audio-recordings"],
      testMatch: /audiomoth-upload\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "member-permissions",
      dependencies: ["audiomoth-upload"],
      testMatch: /member-permissions\.spec\.ts/,
      use: { ...desktopChrome },
    },
    {
      name: "settings",
      dependencies: ["member-permissions"],
      testMatch: /settings\.spec\.ts/,
      use: { ...desktopChrome },
    },
  ],
});
