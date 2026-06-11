import { test } from "@playwright/test";
import { editOrganization } from "../support/manage-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("edits the disposable organization profile", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await editOrganization(page, testInfo);
});
