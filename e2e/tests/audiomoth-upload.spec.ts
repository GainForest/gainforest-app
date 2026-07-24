import { expect, test } from "@playwright/test";
import { screenshotStep } from "../support/artifacts";
import { createDeploymentEventViaApi, scanSdCardFiles } from "../support/audiomoth-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

/**
 * AudioMoth SD-card upload flow: create a chime deployment, "insert" a card
 * of generated AudioMoth WAVs, verify the deployment is recognised from the
 * embedded chime ID, upload, and confirm the recordings appear with a player
 * on the deployment's detail page.
 *
 * When the environment has no recordings storage configured
 * (DATA_JOBS_S3_*), the flow is still exercised up to the friendly
 * storage-unavailable message and the test passes with an annotation.
 * Uploaded archival objects live under audiomoth/<disposable-did>/ in the
 * test bucket; the disposable account teardown removes all PDS records.
 */
test("recognises an SD card and uploads recordings", async ({ page }, testInfo) => {
  test.setTimeout(240_000);

  const deployment = await createDeploymentEventViaApi(page, testInfo);
  const fileNames = await scanSdCardFiles(page, testInfo, deployment);

  await page.getByRole("button", { name: /upload 2 recordings/i }).click();

  const doneHeading = page.getByText(/upload complete/i);
  const notConfigured = page.getByText(/storage is not set up yet/i);
  await expect(doneHeading.or(notConfigured)).toBeVisible({ timeout: 120_000 });
  await screenshotStep(page, testInfo, "audiomoth-upload-finished");

  if (await notConfigured.isVisible().catch(() => false)) {
    testInfo.annotations.push({
      type: "skipped-upload",
      description: "Recordings storage (DATA_JOBS_S3_*) is not configured in this environment; scan + match verified.",
    });
    return;
  }

  // The recordings must now be playable on the deployment detail page.
  await page.goto(`/deployments/${encodeURIComponent(deployment.did)}/${encodeURIComponent(deployment.rkey)}`, {
    waitUntil: "domcontentloaded",
  });
  for (const name of fileNames) {
    await expect(page.getByText(name)).toBeVisible({ timeout: 60_000 });
  }
  await expect(page.getByRole("button", { name: new RegExp(`play ${fileNames[0]}`, "i") })).toBeEnabled({
    timeout: 30_000,
  });
  await screenshotStep(page, testInfo, "audiomoth-deployment-recordings");

  // Re-scanning the same card must recognise the files as already uploaded.
  await scanSdCardFiles(page, testInfo, deployment);
  await page.getByRole("button", { name: /upload 2 recordings/i }).click();
  await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/already uploaded/i).first()).toBeVisible();
  await screenshotStep(page, testInfo, "audiomoth-upload-dedupe");
});
