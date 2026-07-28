import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import {
  getPdsRecord,
  parseAtUri,
  trackCreatedPdsRecord,
  waitForOccurrenceByScientificName,
  waitForPdsRecordDeleted,
  type PdsRepoRecord,
} from "./pds";
import { groupManageBasePath, readCgsOrgMetadata } from "./cgs-org";

const OBSERVATION_EVENT_DATE = "2026-06-10";
const OBSERVATION_LATITUDE = "-3.005";
const OBSERVATION_LONGITUDE = "-60.005";

type CreatedObservation = {
  scientificName: string;
  vernacularName: string;
  updatedScientificName: string;
  updatedVernacularName: string;
  uri: string;
  did: string;
  rkey: string;
  record: PdsRepoRecord;
};

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type ObservationCsvRow = {
  scientificName: string;
  vernacularName: string;
  recordedBy: string;
  locality: string;
  country: string;
  habitat: string;
  occurrenceRemarks: string;
};

function buildObservationCsv(input: ObservationCsvRow): string {
  return buildObservationCsvRows([input]);
}

function buildObservationCsvRows(rows: ObservationCsvRow[]): string {
  const headers = [
    "scientificName",
    "vernacularName",
    "eventDate",
    "decimalLatitude",
    "decimalLongitude",
    "recordedBy",
    "locality",
    "country",
    "habitat",
    "occurrenceRemarks",
  ];
  const body = rows.map((input) =>
    [
      input.scientificName,
      input.vernacularName,
      OBSERVATION_EVENT_DATE,
      OBSERVATION_LATITUDE,
      OBSERVATION_LONGITUDE,
      input.recordedBy,
      input.locality,
      input.country,
      input.habitat,
      input.occurrenceRemarks,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return `${headers.join(",")}\n${body.join("\n")}\n`;
}

async function selectUploadSite(page: Page, siteName: string): Promise<void> {
  const trigger = page.locator("#site-select");
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  await trigger.click();

  const option = page.getByRole("option", { name: new RegExp(escapeRegExp(siteName)) }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await expect(option).toBeEnabled({ timeout: 30_000 });
  await option.click();
  await expect(page.getByText(siteName).first()).toBeVisible({ timeout: 10_000 });
}

function manageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

async function createObservationFromUpload(page: Page, testInfo: TestInfo, siteName: string): Promise<CreatedObservation> {
  console.log(`[e2e] Creating observation through tree upload for site ${siteName}.`);
  const suffix = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;
  const scientificName = `E2E Observation Tree ${suffix}`;
  const vernacularName = `E2E test seedling ${suffix}`;
  const updatedScientificName = `E2E Observation Tree Edited ${suffix}`;
  const updatedVernacularName = `E2E edited seedling ${suffix}`;

  await page.goto(`${manageBasePath()}/trees?mode=upload`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /upload trees/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "observation-upload-open");

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "e2e-observation.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(buildObservationCsv({
      scientificName,
      vernacularName,
      recordedBy: "Disposable E2E Observer",
      locality: "Disposable test plot",
      country: "Brazil",
      habitat: "E2E canopy gap",
      occurrenceRemarks: "Created by the disposable browser test before drawer editing.",
    })),
  });
  await expect(page.getByText("e2e-observation.csv")).toBeVisible({ timeout: 15_000 });
  await selectUploadSite(page, siteName);
  await screenshotStep(page, testInfo, "observation-upload-file-ready");

  const continueToMapping = page.getByRole("button", { name: /continue to match headings/i });
  await expect(continueToMapping).toBeEnabled({ timeout: 15_000 });
  await continueToMapping.click();

  await expect(page.getByRole("heading", { name: /match file headings/i })).toBeVisible({ timeout: 15_000 });
  const continueToPreview = page.getByRole("button", { name: /continue to preview/i });
  await expect(continueToPreview).toBeEnabled({ timeout: 15_000 });
  await screenshotStep(page, testInfo, "observation-upload-mappings");
  await continueToPreview.click();

  await expect(page.getByRole("heading", { name: /review & verify/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/all\s+1\s+row(?:\s+is)?\s+ready/i)).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "observation-upload-preview");
  await page.getByRole("button", { name: /upload 1 valid row/i }).click();

  await expect(page.getByText(/successfully saved 1 tree/i)).toBeVisible({ timeout: 120_000 });
  await screenshotStep(page, testInfo, "observation-upload-saved");

  const record = await waitForOccurrenceByScientificName(scientificName);
  console.log(`[e2e] Created observation ${record.uri}.`);
  trackCreatedPdsRecord(record);
  const parsed = parseAtUri(record.uri);

  expect(record.value.vernacularName).toBe(vernacularName);
  expect(record.value.eventDate).toBe(OBSERVATION_EVENT_DATE);
  expect(String(record.value.decimalLatitude)).toBe(OBSERVATION_LATITUDE);
  expect(String(record.value.decimalLongitude)).toBe(OBSERVATION_LONGITUDE);

  return {
    scientificName,
    vernacularName,
    updatedScientificName,
    updatedVernacularName,
    uri: record.uri,
    did: parsed.did,
    rkey: parsed.rkey,
    record,
  };
}

async function openObservationDrawer(page: Page, observation: CreatedObservation): Promise<Locator> {
  console.log(`[e2e] Opening observation drawer for ${observation.uri}.`);
  const recordParam = `${observation.did}/app.gainforest.dwc.occurrence/${observation.rkey}`;
  const url = `/observations?record=${encodeURIComponent(recordParam)}`;
  const deadline = Date.now() + 150_000;
  let lastError: unknown = null;

  while (Date.now() <= deadline) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const matchingDialog = page.getByRole("dialog").filter({ hasText: observation.scientificName }).first();
    try {
      await expect(matchingDialog).toBeVisible({ timeout: 20_000 });
      return page.getByRole("dialog").first();
    } catch (error) {
      lastError = error;
      console.log(`[e2e] Observation drawer not ready yet; retrying ${observation.uri}.`);
      await page.waitForTimeout(5_000);
    }
  }

  throw new Error(`Timed out opening observation drawer for ${observation.uri}: ${String(lastError)}`);
}

async function cleanupObservationIfNeeded(page: Page, observation: CreatedObservation, deleted: boolean): Promise<void> {
  if (deleted) return;

  const org = readCgsOrgMetadata();
  await page.request.post("/api/manage/proxy", {
    data: { operation: "deleteOccurrenceCascade", rkey: observation.rkey, ...(org ? { repo: org.groupDid } : {}) },
  }).catch(() => null);
}

export async function createEditDeleteObservation(page: Page, testInfo: TestInfo, siteName: string): Promise<void> {
  let observation: CreatedObservation | null = null;
  let deleted = false;

  try {
    observation = await createObservationFromUpload(page, testInfo, siteName);
    const org = readCgsOrgMetadata();
    if (org) {
      const updateResponse = await page.request.post("/api/manage/proxy", {
        data: {
          operation: "updateOccurrence",
          repo: org.groupDid,
          rkey: observation.rkey,
          data: {
            scientificName: observation.updatedScientificName,
            vernacularName: observation.updatedVernacularName,
            occurrenceRemarks: "Edited by the disposable CGS organization browser test before deleting this sighting.",
          },
        },
      });
      expect(updateResponse.ok()).toBe(true);
      await expect
        .poll(async () => String((await getPdsRecord(observation!.uri)).value.scientificName), { timeout: 60_000 })
        .toBe(observation.updatedScientificName);
      await screenshotStep(page, testInfo, "observation-cgs-api-edit-saved");

      const deleteResponse = await page.request.post("/api/manage/proxy", {
        data: { operation: "deleteOccurrenceCascade", repo: org.groupDid, rkey: observation.rkey },
      });
      expect(deleteResponse.ok()).toBe(true);
      await waitForPdsRecordDeleted(observation.uri);
      deleted = true;
      await screenshotStep(page, testInfo, "observation-cgs-api-deleted");
      return;
    }

    const dialog = await openObservationDrawer(page, observation);

    await expect(dialog.getByText(/your sighting/i)).toBeVisible({ timeout: 30_000 });
    console.log(`[e2e] Editing observation ${observation.uri}.`);
    await expect(dialog.getByRole("button", { name: /^edit$/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^delete sighting$/i }).first()).toBeVisible();
    await screenshotStep(page, testInfo, "observation-drawer-owner-controls");

    await dialog.getByRole("button", { name: /^edit$/i }).click();
    await dialog.getByLabel(/scientific name/i).fill(observation.updatedScientificName);
    await dialog.getByLabel(/common name/i).fill(observation.updatedVernacularName);
    await dialog.getByLabel(/notes/i).fill("Edited by the disposable browser test before deleting this sighting.");
    await screenshotStep(page, testInfo, "observation-drawer-edit-ready");
    await dialog.getByRole("button", { name: /save changes/i }).click();

    await expect(dialog.getByText(/sighting saved/i)).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByText(observation.updatedScientificName).first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => String((await getPdsRecord(observation!.uri)).value.scientificName), { timeout: 60_000 })
      .toBe(observation.updatedScientificName);
    await screenshotStep(page, testInfo, "observation-drawer-edit-saved");

    console.log(`[e2e] Deleting observation ${observation.uri}.`);
    await dialog.getByRole("button", { name: /^delete sighting$/i }).first().click();
    await expect(dialog.getByText(/delete this sighting/i)).toBeVisible({ timeout: 10_000 });
    await screenshotStep(page, testInfo, "observation-drawer-delete-confirm");
    await dialog.getByRole("button", { name: /^delete sighting$/i }).last().click();

    await expect(dialog).not.toBeVisible({ timeout: 60_000 });
    await waitForPdsRecordDeleted(observation.uri);
    deleted = true;
    await screenshotStep(page, testInfo, "observation-drawer-deleted");
  } finally {
    if (observation) await cleanupObservationIfNeeded(page, observation, deleted);
  }
}

/* ── Right-click to group (ECO-787) ─────────────────────────────────────────
 * Uploads two sightings, then drives the grouping entirely from the tile's
 * right-click menu: right-click outside the selection claims that one tile,
 * right-click inside a multi-tile selection keeps it whole, and "Group into
 * dataset" opens the same modal the bottom action bar uses. */

async function uploadObservationRows(
  page: Page,
  testInfo: TestInfo,
  siteName: string,
  rows: ObservationCsvRow[],
): Promise<void> {
  const count = rows.length;
  await page.goto(`${manageBasePath()}/trees?mode=upload`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /upload trees/i })).toBeVisible({ timeout: 60_000 });

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "e2e-observations-group.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(buildObservationCsvRows(rows)),
  });
  await expect(page.getByText("e2e-observations-group.csv")).toBeVisible({ timeout: 15_000 });
  await selectUploadSite(page, siteName);

  const continueToMapping = page.getByRole("button", { name: /continue to match headings/i });
  await expect(continueToMapping).toBeEnabled({ timeout: 15_000 });
  await continueToMapping.click();

  await expect(page.getByRole("heading", { name: /match file headings/i })).toBeVisible({ timeout: 15_000 });
  const continueToPreview = page.getByRole("button", { name: /continue to preview/i });
  await expect(continueToPreview).toBeEnabled({ timeout: 15_000 });
  await continueToPreview.click();

  await expect(page.getByRole("heading", { name: /review & verify/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(new RegExp(`all\\s+${count}\\s+rows?\\s+(?:is|are)\\s+ready`, "i"))).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "grouping-upload-preview");
  await page.getByRole("button", { name: new RegExp(`upload ${count} valid rows?`, "i") }).click();

  await expect(page.getByText(new RegExp(`successfully saved ${count} trees?`, "i"))).toBeVisible({ timeout: 120_000 });
}

/** The manage grid reads from the indexer, which trails the PDS write. */
async function waitForObservationTile(page: Page, name: string): Promise<Locator> {
  const tile = page.getByRole("button", { name: new RegExp(`open observation details: ${escapeRegExp(name)}`, "i") }).first();
  const deadline = Date.now() + 180_000;

  while (Date.now() <= deadline) {
    if (await tile.isVisible({ timeout: 10_000 }).catch(() => false)) return tile;
    console.log(`[e2e] Waiting for "${name}" to appear in the observations grid.`);
    await page.waitForTimeout(5_000);
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  throw new Error(`Timed out waiting for observation tile "${name}".`);
}

export async function groupObservationsFromContextMenu(page: Page, testInfo: TestInfo, siteName: string): Promise<void> {
  const suffix = `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;
  const names = [`E2E Right Click One ${suffix}`, `E2E Right Click Two ${suffix}`];
  const datasetName = `E2E right-click folder ${suffix}`;
  const created: PdsRepoRecord[] = [];

  console.log("[e2e] Uploading two sightings for the right-click grouping check.");
  await uploadObservationRows(
    page,
    testInfo,
    siteName,
    names.map((vernacularName, index) => ({
      scientificName: `E2E Contextus menuensis ${index + 1} ${suffix}`,
      vernacularName,
      recordedBy: "Disposable E2E Observer",
      locality: "Disposable test plot",
      country: "Brazil",
      habitat: "E2E canopy gap",
      occurrenceRemarks: "Created by the disposable browser test to check right-click grouping.",
    })),
  );

  for (const [index] of names.entries()) {
    const record = await waitForOccurrenceByScientificName(`E2E Contextus menuensis ${index + 1} ${suffix}`);
    trackCreatedPdsRecord(record);
    created.push(record);
  }

  try {
    await page.goto(`${manageBasePath()}/observations`, { waitUntil: "domcontentloaded" });
    const firstTile = await waitForObservationTile(page, names[0]);
    await waitForObservationTile(page, names[1]);
    await screenshotStep(page, testInfo, "grouping-observations-grid");

    // 1. Right-click with nothing selected: the tile becomes the selection and
    //    the menu offers the grouping actions.
    await firstTile.click({ button: "right" });
    const menu = page.getByRole("menu").first();
    await expect(menu).toBeVisible({ timeout: 10_000 });
    await expect(menu.getByRole("menuitem", { name: /^open$/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /group into dataset/i })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /add to project/i })).toBeVisible();
    await screenshotStep(page, testInfo, "grouping-context-menu-single");
    // Escape dismisses the menu without dropping the tile it claimed.
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1 observation selected/i).first()).toBeVisible({ timeout: 10_000 });

    // 2. Add the second tile, then right-click inside the selection: it stays
    //    whole and the menu says it covers both.
    const secondTile = page.getByRole("button", { name: new RegExp(escapeRegExp(names[1]), "i") }).first();
    await secondTile.locator("[role='checkbox']").click();
    await expect(page.getByText(/2 observations selected/i).first()).toBeVisible({ timeout: 10_000 });

    const firstSelected = page.getByRole("button", { name: new RegExp(escapeRegExp(names[0]), "i") }).first();
    await firstSelected.click({ button: "right" });
    const multiMenu = page.getByRole("menu").first();
    await expect(multiMenu).toBeVisible({ timeout: 10_000 });
    await expect(multiMenu.getByText(/2 observations selected/i)).toBeVisible();
    await screenshotStep(page, testInfo, "grouping-context-menu-multiple");

    // 3. Group both into a brand-new folder straight from the menu.
    await multiMenu.getByRole("menuitem", { name: /group into dataset/i }).click();
    const nameField = page.locator("#observation-dataset-name");
    await expect(nameField).toBeVisible({ timeout: 15_000 });
    await nameField.fill(datasetName);
    await screenshotStep(page, testInfo, "grouping-dataset-modal");
    await page.getByRole("button", { name: /create & group/i }).click();

    await expect(nameField).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(datasetName), "i") }).first()).toBeVisible({ timeout: 60_000 });
    await screenshotStep(page, testInfo, "grouping-dataset-created");
    console.log(`[e2e] Right-click grouping created folder "${datasetName}".`);
  } finally {
    const org = readCgsOrgMetadata();
    for (const record of created) {
      const { rkey } = parseAtUri(record.uri);
      await page.request.post("/api/manage/proxy", {
        data: { operation: "deleteOccurrenceCascade", rkey, ...(org ? { repo: org.groupDid } : {}) },
      }).catch(() => null);
    }
  }
}
