import { test } from "@playwright/test";
import { createEditDeleteObservation } from "../support/observation-flow";
import { createSiteByUpload } from "../support/site-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("creates, edits, and deletes an observation", async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  const siteName = await createSiteByUpload(page, testInfo);
  await createEditDeleteObservation(page, testInfo, siteName);
});
