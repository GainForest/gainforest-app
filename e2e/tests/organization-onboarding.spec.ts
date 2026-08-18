import { test } from "@playwright/test";
import { completeOrganizationOnboarding, editOrganizationProfile } from "../support/manage-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("creates a CGS organization and edits organization info", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const org = await completeOrganizationOnboarding(page, testInfo);
  await editOrganizationProfile(page, testInfo, org);
});
