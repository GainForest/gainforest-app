import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { test } from "@playwright/test";
import {
  hasConfiguredAccountCredentials,
  signInWithConfiguredAccount,
  signInWithDisposableEmailAccount,
} from "../support/auth-flow";
import { disposableAccountMetadataPath } from "../support/disposable-email";

const authStatePath = "e2e/.auth/user.json";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await rm(authStatePath, { force: true });
  await rm(disposableAccountMetadataPath, { force: true });
});

test("sanity checks handle and password login", async ({ page }, testInfo) => {
  test.skip(
    !hasConfiguredAccountCredentials(),
    "Set E2E_TEST_HANDLE and E2E_TEST_PASSWORD to run the handle/password login sanity check.",
  );

  test.setTimeout(240_000);
  await signInWithConfiguredAccount(page, testInfo);
});

test("creates disposable email browser state", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await rm(authStatePath, { force: true });
  await rm(disposableAccountMetadataPath, { force: true });

  await signInWithDisposableEmailAccount(page, testInfo);
  await mkdir(dirname(authStatePath), { recursive: true });
  await page.context().storageState({ path: authStatePath });
});
