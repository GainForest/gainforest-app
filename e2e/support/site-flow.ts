import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { waitForCertifiedLocationByName } from "./pds";
import { groupManageBasePath, readCgsOrgMetadata } from "./cgs-org";

const VALID_SITE_MAP = JSON.stringify({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[[-60, -3], [-60.01, -3], [-60.01, -3.01], [-60, -3.01], [-60, -3]]],
  },
  properties: {},
});

async function expectDisabled(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} should be disabled`).toBeDisabled();
}

function manageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

export async function createSiteByUpload(page: Page, testInfo: TestInfo): Promise<string> {
  const siteName = `Uploaded Map Site ${Date.now()}`;
  await page.goto(`${manageBasePath()}/sites`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^(my )?sites$/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "sites-open");

  await page.getByRole("button", { name: /add (a )?site/i }).first().click();
  const dialog = page.locator('[role="dialog"]:visible').last();
  await expect(dialog.getByRole("heading", { name: /add site/i }).first()).toBeVisible({ timeout: 15_000 });
  await expectDisabled(dialog.getByRole("button", { name: /^add$/i }), "empty site submit");
  await dialog.locator("#site-editor-name").fill("Invalid Upload Site");
  await expectDisabled(dialog.getByRole("button", { name: /^add$/i }), "site name-only submit");

  await dialog.locator('input[type="file"]').setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{not valid") });
  await dialog.getByRole("button", { name: /^add$/i }).click();
  await expect(dialog.getByText(/choose a valid map file/i)).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "site-invalid-file-error");

  await dialog.locator('input[type="file"]').setInputFiles({ name: "site-upload.geojson", mimeType: "application/geo+json", buffer: Buffer.from(VALID_SITE_MAP) });
  await dialog.locator("#site-editor-name").fill(siteName);
  await dialog.getByRole("button", { name: /^add$/i }).click();
  await expect(dialog.getByText(/site added!/i)).toBeVisible({ timeout: 90_000 });
  await screenshotStep(page, testInfo, "site-upload-created");
  await dialog.getByRole("button", { name: /^close$/i }).last().click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(siteName).first()).toBeVisible({ timeout: 45_000 });
  await waitForCertifiedLocationByName(siteName);
  await screenshotStep(page, testInfo, "sites-after-upload");
  return siteName;
}

export async function createSiteByDrawing(page: Page, testInfo: TestInfo): Promise<string> {
  const siteName = `Drawn Map Site ${Date.now()}`;
  await page.goto(`${manageBasePath()}/sites`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /add (a )?site/i }).first().click();
  const dialog = page.locator('[role="dialog"]:visible').last();
  await expect(dialog.getByRole("heading", { name: /add site/i }).first()).toBeVisible({ timeout: 15_000 });
  await dialog.locator("#site-editor-name").fill(siteName);
  await dialog.getByRole("button", { name: /draw site/i }).click();

  const drawDialog = page.locator('[role="dialog"]:visible').last();
  await expect(drawDialog.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 15_000 });
  const doneButton = drawDialog.getByRole("button", { name: /^done$/i });
  await expect
    .poll(async () => {
      await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: "polygon-data",
            data: [{ lng: -61, lat: -4 }, { lng: -61.01, lat: -4 }, { lng: -61.01, lat: -4.01 }],
          },
        }));
      });
      return doneButton.isEnabled().catch(() => false);
    }, { timeout: 15_000 })
    .toBe(true);
  await doneButton.click({ force: true });
  await screenshotStep(page, testInfo, "site-draw-ready");

  await expect(dialog.getByText(/drawn-site-map/i)).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("button", { name: /^add$/i }).click();
  await expect(dialog.getByText(/site added!/i)).toBeVisible({ timeout: 90_000 });
  await screenshotStep(page, testInfo, "site-drawn-created");
  await dialog.getByRole("button", { name: /^close$/i }).last().click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(siteName).first()).toBeVisible({ timeout: 45_000 });
  await waitForCertifiedLocationByName(siteName);
  await screenshotStep(page, testInfo, "sites-after-drawn");
  return siteName;
}
