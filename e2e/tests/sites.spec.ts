import { test } from "@playwright/test";
import { createSiteByDrawing, createSiteByUpload } from "../support/site-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("creates sites by upload and drawing", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await createSiteByUpload(page, testInfo);
  await createSiteByDrawing(page, testInfo);
});
