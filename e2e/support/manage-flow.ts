import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import {
  listDisposableEmailMessages,
  readDisposableAccountMetadata,
  waitForInboxPasswordResetToken,
} from "./disposable-email";

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

export async function completeUserOnboarding(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^user$/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "user-onboarding-direct");

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

export async function editProfile(page: Page, testInfo: TestInfo): Promise<void> {
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

export async function convertToOrganization(page: Page, testInfo: TestInfo): Promise<void> {
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

export async function editOrganization(page: Page, testInfo: TestInfo): Promise<void> {
  const targetName = "Disposable E2E Forest Org Edited";
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto("/manage?mode=edit", { waitUntil: "domcontentloaded" });
    await screenshotStep(page, testInfo, attempt === 1 ? "org-edit-open" : `org-edit-open-retry-${attempt}`);

    const nameInput = page.locator('input[placeholder="Organization name"]:visible').first();
    await expect(nameInput).toBeVisible({ timeout: 30_000 });
    await nameInput.fill(targetName);
    await page.locator('textarea[placeholder="Short description…"]:visible').first().fill("Edited organization summary from disposable testing.");
    await screenshotStep(page, testInfo, attempt === 1 ? "org-edit-ready" : `org-edit-ready-retry-${attempt}`);

    const saveButton = page.getByRole("button", { name: /^save$/i }).first();
    const saveEnabled = await saveButton.isEnabled().catch(() => false);
    if (!saveEnabled) {
      await page.goto("/manage", { waitUntil: "domcontentloaded" });
      try {
        await expect(page.getByText(new RegExp(targetName, "i")).first()).toBeVisible({ timeout: 30_000 });
        await screenshotStep(page, testInfo, "org-edit-saved");
        return;
      } catch (error) {
        lastError = error;
        await screenshotStep(page, testInfo, `org-edit-no-save-changes-${attempt}`);
        continue;
      }
    }

    const navigation = page.waitForURL(isPlainManageUrl, { timeout: 45_000 }).catch((error: unknown) => {
      lastError = error;
      return null;
    });
    try {
      await saveButton.click({ noWaitAfter: true, timeout: 10_000 });
    } catch (error) {
      lastError = error;
      if ((await bodyText(page)).includes(targetName)) {
        await screenshotStep(page, testInfo, "org-edit-saved");
        return;
      }
      await screenshotStep(page, testInfo, `org-edit-save-click-failed-${attempt}`);
      continue;
    }
    const navigated = await navigation;
    if (!navigated) {
      await screenshotStep(page, testInfo, `org-edit-save-stalled-${attempt}`);
      continue;
    }

    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    try {
      await expect(page.getByText(new RegExp(targetName, "i")).first()).toBeVisible({ timeout: 30_000 });
      await screenshotStep(page, testInfo, "org-edit-saved");
      return;
    } catch (error) {
      lastError = error;
      await screenshotStep(page, testInfo, `org-edit-save-not-visible-${attempt}`);
    }
  }

  if ((await bodyText(page)).includes(targetName)) {
    await screenshotStep(page, testInfo, "org-edit-saved");
    return;
  }

  throw lastError instanceof Error ? lastError : new Error("Organization edit did not finish after 3 attempts.");
}

export async function checkSettings(page: Page, testInfo: TestInfo): Promise<void> {
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
