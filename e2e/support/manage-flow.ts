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
  return url.pathname.endsWith("/manage") && !url.searchParams.has("mode");
}

async function clickAndWaitForPlainManage(page: Page, button: Locator): Promise<void> {
  const navigation = page.waitForURL(isPlainManageUrl, { timeout: 90_000 }).catch(() => null);
  await button.click({ noWaitAfter: true, timeout: 10_000 }).catch((error: unknown) => {
    if (!isPlainManageUrl(new URL(page.url()))) throw error;
  });
  await navigation;
}

async function clickAndWaitForRefresh(page: Page, button: Locator): Promise<void> {
  const response = page.waitForResponse((res) => res.request().method() !== "GET" && res.ok(), { timeout: 90_000 }).catch(() => null);
  await button.click({ timeout: 10_000 });
  await response;
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function waitForProfileOnManage(page: Page, name: RegExp, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";

  while (Date.now() <= deadline) {
    await page.goto("/manage", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    if (await page.getByText(name).first().isVisible({ timeout: 5_000 }).catch(() => false)) return;
    lastText = await bodyText(page).catch(() => "");
    await page.waitForTimeout(5_000);
  }

  throw new Error(`Timed out waiting for profile ${name} on /manage. Last page text: ${lastText.slice(0, 500)}`);
}

export async function completeUserOnboarding(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage?mode=onboard-user", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("dialog", { name: /set up your profile/i })).not.toBeVisible({ timeout: 10_000 });
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
  await waitForProfileOnManage(page, /Disposable E2E Profile/i);
  await screenshotStep(page, testInfo, "user-onboarding-complete");
}

export async function editProfile(page: Page, testInfo: TestInfo): Promise<void> {
  await waitForProfileOnManage(page, /Disposable E2E Profile/i);
  await screenshotStep(page, testInfo, "profile-edit-open");

  await page.getByRole("button", { name: /edit name and bio/i }).click();
  const nameInput = page.locator('input[placeholder="Display name"]:visible').first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await nameInput.fill("");
  await page.getByRole("button", { name: /^save$/i }).first().click();
  await expect(page.getByText(/add a name before saving/i)).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "profile-edit-empty-name-error");

  await nameInput.fill("Disposable E2E Profile Edited");
  await page.locator('textarea[placeholder="Short bio…"]:visible').first().fill("Edited profile description from disposable browser testing.");
  await screenshotStep(page, testInfo, "profile-edit-ready");
  await clickAndWaitForRefresh(page, page.getByRole("button", { name: /^save$/i }).first());
  await expect(page.getByText(/Disposable E2E Profile Edited/i).first()).toBeVisible({ timeout: 30_000 });

  const websiteChip = page.getByRole("button", { name: /add website|website/i }).first();
  await expect(websiteChip).toBeVisible({ timeout: 30_000 });
  await websiteChip.click();
  const websiteInput = page.getByPlaceholder(/yourorganization/i).first();
  await expect(websiteInput).toBeVisible({ timeout: 10_000 });
  await websiteInput.fill("bad");
  const websiteDialog = page.locator('[role="dialog"]:visible').last();
  await websiteDialog.getByRole("button", { name: /^save$/i }).click();
  await expect(websiteDialog.getByText(/please enter a valid url/i)).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "profile-edit-invalid-website");
  await websiteInput.fill("example.org");
  await clickAndWaitForRefresh(page, websiteDialog.getByRole("button", { name: /^save$/i }));
  await expect(websiteDialog).not.toBeVisible({ timeout: 15_000 });

  await expect(page.getByText(/example\.org/i).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, "profile-edit-saved");
}

export async function checkSettings(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto("/manage/settings", { waitUntil: "domcontentloaded" });
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
