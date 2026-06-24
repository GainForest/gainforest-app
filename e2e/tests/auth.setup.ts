import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "@playwright/test";
import {
  hasConfiguredAccountCredentials,
  signInWithConfiguredAccount,
  signInWithDisposableEmailAccount,
} from "../support/auth-flow";
import { disposableAccountMetadataPath, memberDisposableAccountMetadataPath } from "../support/disposable-email";
import { cgsOrgMetadataPath } from "../support/cgs-org";

const authStatePath = "e2e/.auth/user.json";
const memberAuthStatePath = "e2e/.auth/member.json";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await rm(authStatePath, { force: true });
  await rm(memberAuthStatePath, { force: true });
  await rm(disposableAccountMetadataPath, { force: true });
  await rm(memberDisposableAccountMetadataPath, { force: true });
  await rm(cgsOrgMetadataPath, { force: true });
});

test("sanity checks handle and password login", async ({ page }, testInfo) => {
  if (!hasConfiguredAccountCredentials()) {
    throw new Error("E2E_TEST_HANDLE and E2E_TEST_PASSWORD are required for the mandatory handle/password login sanity check.");
  }

  test.setTimeout(240_000);
  await signInWithConfiguredAccount(page, testInfo);
});

test("creates disposable email browser state", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await rm(authStatePath, { force: true });
  await rm(memberAuthStatePath, { force: true });
  await rm(disposableAccountMetadataPath, { force: true });
  await rm(memberDisposableAccountMetadataPath, { force: true });
  await rm(cgsOrgMetadataPath, { force: true });

  await signInWithDisposableEmailAccount(page, testInfo);
  await mkdir(dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
