import { test } from "@playwright/test";
import { checkSettings } from "../support/manage-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("checks settings and changes the disposable password", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await checkSettings(page, testInfo);
});
