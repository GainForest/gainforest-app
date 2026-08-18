import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { screenshotStep } from "../support/artifacts";
import {
  createDeploymentEventViaApi,
  makeAudioMothWavBuffer,
  randomDeploymentIdHex,
  scanSdCardFiles,
} from "../support/audiomoth-flow";
import { listAcDeploymentFoldersByName, trackCreatedPdsRecord } from "../support/pds";

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

/**
 * Interrupted-upload resume: a card whose recordings match no deployment is
 * uploaded under a typed folder name, then — as after an interruption — the
 * same card is read again. The picker must pre-select the folder the first
 * attempt created, and after both attempts the account must hold exactly ONE
 * folder with that name (the bug was a duplicate folder per resume).
 */
test("resuming an interrupted card upload reuses the same folder", async ({ page }, testInfo) => {
  test.setTimeout(240_000);

  const orphanChimeId = randomDeploymentIdHex(); // matches no dwc.event on purpose
  const folderName = `E2E Resume ${Date.now()}-${testInfo.workerIndex}`;
  const cardDir = join(tmpdir(), `e2e-audiomoth-${Date.now()}`, folderName);
  mkdirSync(cardDir, { recursive: true });

  const writeWav = (name: string, comment: string) =>
    writeFileSync(
      join(cardDir, name),
      makeAudioMothWavBuffer({ deploymentId: orphanChimeId, recordedAtComment: comment }),
    );
  writeWav("20240416_190000.WAV", "19:00:00 16/04/2024");
  writeWav("20240416_190500.WAV", "19:05:00 16/04/2024");

  const scanCardFolder = async () => {
    await page.goto("/observations/audio?tab=upload", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /choose sd card or folder/i })).toBeVisible({ timeout: 60_000 });
    await page.locator("input[webkitdirectory]").setInputFiles(cardDir);
    // No chime match → the folder question must appear.
    await expect(page.getByText(/where should these recordings go/i)).toBeVisible({ timeout: 30_000 });
  };

  const uploadAndSettle = async (): Promise<boolean> => {
    await page.getByRole("button", { name: /upload \d+ recording/i }).click();
    const done = page.getByText(/upload complete/i);
    const notConfigured = page.getByText(/storage is not set up yet/i);
    await expect(done.or(notConfigured)).toBeVisible({ timeout: 120_000 });
    return !(await notConfigured.isVisible().catch(() => false));
  };

  try {
    // ── First attempt: name a new folder for the card. ──
    await scanCardFolder();
    const newFolderButton = page.getByRole("button", { name: /add a deployment/i });
    if (await newFolderButton.isVisible().catch(() => false)) await newFolderButton.click();
    await expect(page.locator("#upload-group-name")).toHaveValue(folderName);
    await screenshotStep(page, testInfo, "audiomoth-resume-first-scan");

    const storageConfigured = await uploadAndSettle();
    if (!storageConfigured) {
      testInfo.annotations.push({
        type: "skipped-upload",
        description: "Recordings storage is not configured; folder creation + resume pre-selection still verified.",
      });
    }
    await screenshotStep(page, testInfo, "audiomoth-resume-first-upload");

    // The first attempt must have created the folder (even a storage-less
    // attempt creates it before presigning fails).
    await expect
      .poll(async () => (await listAcDeploymentFoldersByName(folderName)).length, { timeout: 30_000 })
      .toBe(1);

    // ── Resume: the same card is read again, with one more recording on it. ──
    writeWav("20240416_191000.WAV", "19:10:00 16/04/2024");
    await scanCardFolder();

    // The picker recognises the card and selects the existing folder — the
    // user is told the recordings will join it, not start a duplicate.
    await expect(page.getByText(/you already have a deployment with this name/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[aria-pressed="true"]')).toContainText(folderName);
    await screenshotStep(page, testInfo, "audiomoth-resume-preselected");

    await uploadAndSettle();
    await screenshotStep(page, testInfo, "audiomoth-resume-second-upload");

    // The whole point: still exactly one folder with the card's name.
    const folders = await listAcDeploymentFoldersByName(folderName);
    expect(folders, "a resumed upload must never fork a second folder").toHaveLength(1);
    for (const folder of folders) trackCreatedPdsRecord(folder);
  } finally {
    rmSync(join(cardDir, ".."), { recursive: true, force: true });
  }
});
