import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type E2EEnv = {
  appUrl: string;
  testHandle: string | null;
  testPassword: string | null;
  testDid: string | null;
  testPdsDomain: string | null;
  authBaseUrl: string;
};

function loadDotEnvFile(path: string): void {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] ??= value;
  }
}

loadDotEnvFile(resolve(process.cwd(), "e2e/.env"));

export function getE2EEnv(): E2EEnv {
  const authBaseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL?.trim();
  if (!authBaseUrl) {
    throw new Error("NEXT_PUBLIC_AUTH_BASE_URL is required for E2E tests");
  }

  return {
    appUrl: process.env.E2E_BASE_URL ?? process.env.E2E_APP_URL ?? "https://local-e2e.gainforest.app",
    testHandle: process.env.E2E_TEST_HANDLE?.trim() || null,
    testPassword: process.env.E2E_TEST_PASSWORD?.trim() || null,
    testDid: process.env.E2E_TEST_DID?.trim() || null,
    testPdsDomain: process.env.E2E_TEST_PDS_DOMAIN?.trim() || null,
    authBaseUrl: authBaseUrl.replace(/\/$/, ""),
  };
}
