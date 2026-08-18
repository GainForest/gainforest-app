import { test } from "@playwright/test";
import { completeUserOnboarding } from "../support/manage-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("completes disposable user onboarding", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await completeUserOnboarding(page, testInfo);
});
