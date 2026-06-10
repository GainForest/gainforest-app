import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "../support/artifacts";
import { createAudioRecording } from "../support/audio-flow";
import { fillBumicertForm } from "../support/creation-flow";
import { createEditDeleteObservation } from "../support/observation-flow";
import {
  listDisposableEmailMessages,
  readDisposableAccountMetadata,
  waitForInboxPasswordResetToken,
} from "../support/disposable-email";
import { waitForCertifiedLocationByName } from "../support/pds";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test.describe.configure({ mode: "serial" });

const VALID_SITE_MAP = JSON.stringify({
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [[[-60, -3], [-60.01, -3], [-60.01, -3.01], [-60, -3.01], [-60, -3]]],
  },
  properties: {},
});

async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

async function expectDisabled(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} should be disabled`).toBeDisabled();
}

async function visibleForm(page: Page): Promise<Locator> {
  const form = page.locator("form:visible").first();
  await expect(form).toBeVisible({ timeout: 30_000 });
  return form;
}

async function closeVisibleDialog(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]:visible').last();
  const close = page.locator('[data-slot="dialog-close"]:visible').last();
  if (await close.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await close.click();
  } else {
    await page.getByRole("button", { name: /^close$/i }).last().click();
  }
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
}

function isPlainManageUrl(url: URL): boolean {
  return url.pathname === "/manage" && !url.searchParams.has("mode");
}

async function clickAndWaitForPlainManage(page: Page, button: Locator): Promise<void> {
  const navigation = page.waitForURL(isPlainManageUrl, { timeout: 90_000 }).catch(() => null);
  await button.click({ noWaitAfter: true, timeout: 10_000 }).catch((error: unknown) => {
    if (!isPlainManageUrl(new URL(page.url()))) throw error;
  });
  await navigation;
}

async function completeUserOnboarding(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /create your profile|choose your setup/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "onboarding-choice");

  const userChoice = page.getByRole("button", { name: /^user\b/i }).first();
  if (await userChoice.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userChoice.click();
  } else {
    await page.goto("/manage?mode=onboard-user", { waitUntil: "domcontentloaded" });
  }

  const form = await visibleForm(page);
  await screenshotStep(page, testInfo, "user-onboarding-empty");
  await expectDisabled(form.getByRole("button", { name: /^continue/i }), "empty user onboarding submit");

  await form.getByPlaceholder(/your name/i).fill("Disposable E2E Profile With A Very Long Name That Should Show A Helpful Error 1234567890");
  await expect(page.getByText(/name must be 64 characters or fewer/i)).toBeVisible({ timeout: 10_000 });
  await expectDisabled(form.getByRole("button", { name: /^continue/i }), "too-long user onboarding submit");
  await form.getByPlaceholder(/your name/i).fill("Disposable E2E Profile");
  await form.getByPlaceholder(/short introduction/i).fill("Disposable browser test profile for full end-to-end checks.");
  await screenshotStep(page, testInfo, "user-onboarding-ready");

  await clickAndWaitForPlainManage(page, form.getByRole("button", { name: /^continue/i }));
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText(/Disposable E2E Profile/i).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, "user-onboarding-complete");
}

async function editProfile(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage?mode=edit", { waitUntil: "domcontentloaded" });
  await screenshotStep(page, testInfo, "profile-edit-open");

  const nameInput = page.locator('input[placeholder="Organization name"], input[placeholder="Display name"]').filter({ visible: true }).first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await nameInput.fill("");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await expect(page.getByText(/add a name before saving/i)).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "profile-edit-empty-name-error");

  await nameInput.fill("Disposable E2E Profile Edited");
  await page.locator('textarea[placeholder="Short description…"]:visible').first().fill("Edited profile description from disposable browser testing.");

  const websiteChip = page.getByRole("button", { name: /add website|website/i }).first();
  if (await websiteChip.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await websiteChip.click();
    const websiteInput = page.getByPlaceholder(/yourorganization/i).first();
    await expect(websiteInput).toBeVisible({ timeout: 10_000 });
    await websiteInput.fill("bad");
    const websiteDialog = page.locator('[role="dialog"]:visible').last();
    await websiteDialog.getByRole("button", { name: /^save$/i }).click();
    await expect(websiteDialog.getByText(/please enter a valid url/i)).toBeVisible({ timeout: 10_000 });
    await screenshotStep(page, testInfo, "profile-edit-invalid-website");
    await websiteInput.fill("example.org");
    await websiteDialog.getByRole("button", { name: /^save$/i }).click();
    await expect(websiteDialog).not.toBeVisible({ timeout: 15_000 });
  }

  await screenshotStep(page, testInfo, "profile-edit-ready");
  await clickAndWaitForPlainManage(page, page.getByRole("button", { name: /^save$/i }).first());
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText(/example\.org/i).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, "profile-edit-saved");
}

async function convertToOrganization(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage?mode=onboard-org", { waitUntil: "domcontentloaded" });
  let form = await visibleForm(page);
  await screenshotStep(page, testInfo, "org-conversion-step-one-empty");
  await expectDisabled(form.getByRole("button", { name: /^continue/i }), "empty organization continue");

  await form.getByPlaceholder(/your-organization/i).fill("bad");
  await expect(page.getByText(/enter a valid website url/i)).toBeVisible({ timeout: 10_000 });
  await expectDisabled(form.getByRole("button", { name: /^continue/i }), "invalid organization website submit");
  await screenshotStep(page, testInfo, "org-conversion-invalid-website");

  await form.getByPlaceholder(/your-organization/i).fill("https://example.org");
  await form.getByPlaceholder(/organization name/i).fill("Disposable E2E Forest Organization");
  await form.getByPlaceholder(/short introduction/i).fill("Disposable organization setup for browser checklist testing.");
  await form.locator("label").filter({ hasText: /code of conduct/i }).click();
  await form.getByRole("button", { name: /^continue/i }).click();

  form = await visibleForm(page);
  await screenshotStep(page, testInfo, "org-conversion-ready");

  await clickAndWaitForPlainManage(page, form.getByRole("button", { name: /^(skip and continue|continue)/i }));
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByRole("heading", { name: /Disposable E2E Forest Organization/i }).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, "org-conversion-complete");
}

async function editOrganization(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage?mode=edit", { waitUntil: "domcontentloaded" });
  await screenshotStep(page, testInfo, "org-edit-open");

  const nameInput = page.locator('input[placeholder="Organization name"]:visible').first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await nameInput.fill("Disposable E2E Forest Org Edited");
  await page.locator('textarea[placeholder="Short description…"]:visible').first().fill("Edited organization summary from disposable testing.");
  await screenshotStep(page, testInfo, "org-edit-ready");

  await clickAndWaitForPlainManage(page, page.getByRole("button", { name: /^save$/i }).first());
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.getByText(/Disposable E2E Forest Org Edited/i).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, "org-edit-saved");
}

async function createSiteByUpload(page: Page, testInfo: TestInfo): Promise<string> {
  const siteName = `Uploaded Map Site ${Date.now()}`;
  await page.goto("/manage/sites", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^sites$/i })).toBeVisible({ timeout: 60_000 });
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

async function createSiteByDrawing(page: Page, testInfo: TestInfo): Promise<string> {
  const siteName = `Drawn Map Site ${Date.now()}`;
  await page.goto("/manage/sites", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /add (a )?site/i }).first().click();
  const dialog = page.locator('[role="dialog"]:visible').last();
  await expect(dialog.getByRole("heading", { name: /add site/i }).first()).toBeVisible({ timeout: 15_000 });
  await dialog.locator("#site-editor-name").fill(siteName);
  await dialog.getByRole("button", { name: /draw site/i }).click();

  const drawDialog = page.locator('[role="dialog"]:visible').last();
  await expect(drawDialog.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new MessageEvent("message", {
      origin: "https://polygons-gainforest.vercel.app",
      data: {
        type: "polygon-data",
        data: [{ lng: -61, lat: -4 }, { lng: -61.01, lat: -4 }, { lng: -61.01, lat: -4.01 }],
      },
    }));
  });
  const doneButton = drawDialog.getByRole("button", { name: /^done$/i });
  await expect(doneButton).toBeEnabled({ timeout: 10_000 });
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

async function checkSettings(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage?tab=settings", { waitUntil: "domcontentloaded" });
  await screenshotStep(page, testInfo, "settings-open");
  const text = await bodyText(page);
  for (const disallowedVisibleText of ["DID", "pdsls.dev", "atproto.at"]) {
    expect(text).not.toContain(disallowedVisibleText);
  }

  const metadata = readDisposableAccountMetadata();
  if (!metadata) throw new Error("Disposable account metadata is required for password reset checks.");
  const ignoredMessageIds = new Set((await listDisposableEmailMessages(metadata.inbox)).map((message) => message.id));

  await page.getByRole("button", { name: /send reset code/i }).click({ timeout: 15_000 });
  await expect(page.getByLabel(/code/i)).toBeVisible({ timeout: 30_000 });
  const resetToken = await waitForInboxPasswordResetToken(metadata.inbox, ignoredMessageIds);
  const newPassword = `Password-${Date.now()}-${testInfo.workerIndex}-Aa1!`;

  await page.getByLabel(/code/i).fill(resetToken);
  await page.getByLabel(/new password/i).fill(newPassword);
  await page.getByLabel(/confirm password/i).fill("Mismatch123!");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.getByText(/passwords do not match/i)).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "settings-password-mismatch");

  await page.getByLabel(/confirm password/i).fill(newPassword);
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.getByText(/password changed successfully/i)).toBeVisible({ timeout: 45_000 });
  await screenshotStep(page, testInfo, "settings-password-reset-success");
}

test("runs the full disposable-account checklist", async ({ page }, testInfo) => {
  test.setTimeout(1_200_000);

  await completeUserOnboarding(page, testInfo);
  await editProfile(page, testInfo);
  await convertToOrganization(page, testInfo);
  await editOrganization(page, testInfo);
  await createSiteByUpload(page, testInfo);
  const observationSiteName = await createSiteByDrawing(page, testInfo);
  await createEditDeleteObservation(page, testInfo, observationSiteName);

  const bumicert = await fillBumicertForm(page, testInfo);
  await expect(page.getByRole("link", { name: /open bumicert/i })).toBeVisible({ timeout: 10_000 });
  expect(bumicert.record.value.title).toBe(bumicert.title);

  const audio = await createAudioRecording(page, testInfo);
  expect(String(audio.value.name)).toMatch(/^E2E Audio Recording/);

  await checkSettings(page, testInfo);
});
