import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type E2EEnv = {
  appUrl: string;
  testHandle: string;
  testPassword: string;
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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required. Copy e2e/.env.example to e2e/.env and fill it in.`);
  }
  return value;
}

export function getE2EEnv(): E2EEnv {
  return {
    appUrl: process.env.E2E_BASE_URL ?? process.env.E2E_APP_URL ?? "https://local-e2e.gainforest.app",
    testHandle: required("E2E_TEST_HANDLE"),
    testPassword: required("E2E_TEST_PASSWORD"),
    testDid: process.env.E2E_TEST_DID?.trim() || null,
    testPdsDomain: process.env.E2E_TEST_PDS_DOMAIN?.trim() || null,
    authBaseUrl: (process.env.NEXT_PUBLIC_AUTH_BASE_URL?.trim() || "https://auth.gainforest.app").replace(/\/$/, ""),
  };
}
