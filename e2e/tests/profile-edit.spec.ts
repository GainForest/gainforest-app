import { test } from "@playwright/test";
import { editProfile } from "../support/manage-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("edits the disposable user profile", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await editProfile(page, testInfo);
});
