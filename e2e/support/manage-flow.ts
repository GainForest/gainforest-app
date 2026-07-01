import { resolve } from "node:path";
import { expect, type Locator, type Page, type Response as PlaywrightResponse, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import {
  createDisposableInbox,
  listDisposableEmailMessages,
  readDisposableAccountMetadata,
  waitForInboxPasswordResetToken,
} from "./disposable-email";
import { groupManageBasePath, writeCgsOrgMetadata, type CgsOrgMetadata } from "./cgs-org";

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

type RegisterCgsResponse = {
  groupDid?: unknown;
  handle?: unknown;
  accountPassword?: unknown;
  error?: unknown;
  message?: unknown;
};

const onboardingAvatarPath = resolve(process.cwd(), "e2e/fixtures/profile-avatar.png");
const onboardingBannerPath = resolve(process.cwd(), "e2e/fixtures/profile-banner.png");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRegisterGroupResponse(response: PlaywrightResponse): boolean {
  if (!response.url().includes("/api/cgs/mutation")) return false;
  if (response.request().method() !== "POST" || !response.ok()) return false;
  try {
    const body = response.request().postDataJSON() as { operation?: unknown };
    return body.operation === "registerGroup";
  } catch {
    return false;
  }
}

async function uploadImageThroughEditor(page: Page, trigger: Locator, imagePath: string): Promise<void> {
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  const dialog = page.locator('[role="dialog"]:visible, [data-slot="dialog-content"]:visible, [data-slot="drawer-content"]:visible').last();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await trigger.click({ force: attempt > 0 });
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) break;
  }

  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator('input[type="file"]').setInputFiles(imagePath);
  const doneButton = dialog.getByRole("button", { name: /^done$/i });
  await expect(doneButton).toBeEnabled({ timeout: 30_000 });
  await doneButton.click();
  await expect(dialog).not.toBeVisible({ timeout: 15_000 });
}

async function addOnboardingAvatarAndBanner(page: Page, kind: "user" | "organization"): Promise<void> {
  await uploadImageThroughEditor(
    page,
    page.getByRole("button", { name: /add banner|change banner|banner/i }).first(),
    onboardingBannerPath,
  );
  await uploadImageThroughEditor(
    page,
    page.getByRole("button", { name: kind === "organization" ? /upload logo/i : /upload avatar/i }).first(),
    onboardingAvatarPath,
  );
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

export async function completeUserOnboarding(
  page: Page,
  testInfo: TestInfo,
  options: { displayName?: string; description?: string } = {},
): Promise<void> {
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
  const displayName = options.displayName ?? "Disposable E2E Profile";
  const description = options.description ?? "Disposable browser test profile for full end-to-end checks.";
  await form.getByPlaceholder(/your name/i).fill(displayName);
  await form.getByPlaceholder(/short introduction/i).fill(description);
  await addOnboardingAvatarAndBanner(page, "user");
  await screenshotStep(page, testInfo, "user-onboarding-ready");

  await clickAndWaitForPlainManage(page, form.getByRole("button", { name: /^continue/i }));
  await waitForProfileOnManage(page, new RegExp(escapeRegExp(displayName), "i"));
  await screenshotStep(page, testInfo, "user-onboarding-complete");
}

export async function completeOrganizationOnboarding(page: Page, testInfo: TestInfo): Promise<CgsOrgMetadata> {
  const owner = readDisposableAccountMetadata();
  if (!owner?.did) throw new Error("Disposable owner account metadata is required before creating an organization.");

  // Use a separate disposable recovery inbox for the group. Reusing the owner's
  // ePDS login email can be rejected by the group PDS as already taken.
  const recoveryInbox = await createDisposableInbox();
  const displayName = `E2E Org ${Date.now().toString(36)}`;
  const description = "Disposable organization for CGS-backed browser end-to-end checks.";

  await page.goto("/manage?mode=onboard-org", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /^organization$/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "organization-onboarding-open");

  const form = await visibleForm(page);
  await form.getByPlaceholder(/organization name/i).fill(displayName);
  await form.getByPlaceholder(/short introduction/i).fill(description);
  await addOnboardingAvatarAndBanner(page, "organization");
  await form.getByRole("checkbox", { name: /code of conduct/i }).click();
  await screenshotStep(page, testInfo, "organization-onboarding-basics-ready");

  await form.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByRole("button", { name: /back/i }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder(/tell the story behind your organization/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /advanced/i }).click();
  await page.getByPlaceholder(/recovery@example.com/i).fill(recoveryInbox.email);
  await screenshotStep(page, testInfo, "organization-onboarding-details-ready");

  const registrationResponsePromise = page.waitForResponse(isRegisterGroupResponse, { timeout: 120_000 });
  await page.getByRole("button", { name: /^continue$/i }).click();
  const response = await registrationResponsePromise;
  const payload = await response.json().catch(() => null) as RegisterCgsResponse | null;
  if (typeof payload?.groupDid !== "string") {
    throw new Error(`Organization registration failed (${response.status()}): ${JSON.stringify(payload)}`);
  }

  const metadata: CgsOrgMetadata = {
    source: "cgs-organization",
    createdAt: new Date().toISOString(),
    groupDid: payload.groupDid,
    handle: typeof payload.handle === "string" ? payload.handle : null,
    accountPassword: typeof payload.accountPassword === "string" ? payload.accountPassword : null,
    displayName,
    ownerDid: owner.did,
    serviceEndpoint: owner.serviceEndpoint,
    recoveryEmail: recoveryInbox.email,
    recoveryInbox,
  };
  await writeCgsOrgMetadata(metadata);

  await page.waitForURL((url) => url.pathname.includes("/manage") && !url.searchParams.has("mode"), { timeout: 120_000 });
  await expect(page.getByText(displayName).first()).toBeVisible({ timeout: 90_000 });
  await screenshotStep(page, testInfo, "organization-onboarding-complete");
  return metadata;
}

export async function editOrganizationProfile(page: Page, testInfo: TestInfo, org: CgsOrgMetadata): Promise<void> {
  const basePath = groupManageBasePath(org);
  await page.goto(basePath, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(org.displayName).first()).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "organization-profile-open");

  await page.getByRole("button", { name: /edit name and bio/i }).first().click();
  const nameInput = page.locator('input[placeholder="Organization name"]:visible, input[placeholder="Display name"]:visible').first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  const editedName = `${org.displayName} Edited`;
  await nameInput.fill(editedName);
  await page.locator('textarea:visible').first().fill("Edited organization summary from CGS browser testing.");
  await screenshotStep(page, testInfo, "organization-profile-edit-ready");
  await clickAndWaitForRefresh(page, page.getByRole("button", { name: /^save$/i }).first());
  await expect(page.getByText(editedName).first()).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "organization-profile-edited");
}

type OrganizationMemberRole = "admin" | "member";

type CgsMembersResponse = {
  members?: Array<{ did?: unknown; memberDid?: unknown; role?: unknown }>;
};

type CgsInvitationsResponse = {
  invitations?: Array<{ id?: unknown; repo?: unknown; email?: unknown; role?: unknown; status?: unknown }>;
};

function normalizeTestEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function waitForOrganizationMemberRole(
  page: Page,
  org: CgsOrgMetadata,
  memberDid: string,
  role: OrganizationMemberRole,
): Promise<void> {
  await expect
    .poll(async () => {
      const params = new URLSearchParams({ repo: org.groupDid });
      const response = await page.request.get(`/api/cgs/members?${params.toString()}`).catch(() => null);
      if (!response?.ok()) return false;
      const body = await response.json().catch(() => null) as CgsMembersResponse | null;
      return body?.members?.some((member) => {
        const did = member.did === memberDid || member.memberDid === memberDid;
        return did && member.role === role;
      }) ?? false;
    }, { timeout: 90_000 })
    .toBe(true);
}

async function waitForPendingOrganizationInvitation(
  page: Page,
  org: CgsOrgMetadata,
  email: string,
  role: OrganizationMemberRole,
): Promise<string> {
  const normalizedEmail = normalizeTestEmail(email);
  let invitationId: string | null = null;

  await expect
    .poll(async () => {
      const params = new URLSearchParams({ repo: org.groupDid });
      const response = await page.request.get(`/api/cgs/invitations?${params.toString()}`).catch(() => null);
      if (!response?.ok()) return false;
      const body = await response.json().catch(() => null) as CgsInvitationsResponse | null;
      const invitation = body?.invitations?.find((item) => (
        item.repo === org.groupDid &&
        item.email === normalizedEmail &&
        item.role === role &&
        item.status === "pending" &&
        typeof item.id === "string"
      ));
      invitationId = typeof invitation?.id === "string" ? invitation.id : null;
      return Boolean(invitationId);
    }, { timeout: 90_000 })
    .toBe(true);

  if (!invitationId) throw new Error(`Pending invitation for ${normalizedEmail} was not found.`);
  return invitationId;
}

export async function inviteOrganizationMember(
  page: Page,
  testInfo: TestInfo,
  org: CgsOrgMetadata,
  email: string,
  role: OrganizationMemberRole = "member",
): Promise<string> {
  const normalizedEmail = normalizeTestEmail(email);
  await page.goto(`${groupManageBasePath(org)}/settings`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /organization settings/i })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(/member email address/i).fill(normalizedEmail);
  const roleSelect = page.getByLabel(/role for new member/i);
  if (await roleSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await roleSelect.selectOption(role);
  }
  await screenshotStep(page, testInfo, `organization-invite-${role}-ready`);
  await page.getByRole("button", { name: /^invite$/i }).click();
  await expect(page.getByText(new RegExp(`Invitation sent to ${escapeRegExp(normalizedEmail)}`, "i"))).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(new RegExp(escapeRegExp(normalizedEmail), "i")).first()).toBeVisible({ timeout: 60_000 });
  const invitationId = await waitForPendingOrganizationInvitation(page, org, normalizedEmail, role);
  await screenshotStep(page, testInfo, `organization-invite-${role}-sent`);
  return invitationId;
}

export async function acceptOrganizationInvitationFromAccountMenu(
  page: Page,
  testInfo: TestInfo,
  org: CgsOrgMetadata,
  memberDid: string,
  role: OrganizationMemberRole = "member",
): Promise<void> {
  await page.goto("/manage", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

  const accountMenu = page.getByRole("button", { name: /disposable e2e member|personal account|account/i }).last();
  await expect(accountMenu).toBeVisible({ timeout: 60_000 });
  await accountMenu.click();

  // The account menu no longer shows an "Invitations" eyebrow; confirm it opened
  // via the always-present Sign out action instead.
  await expect(page.getByRole("button", { name: /^sign out$/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(new RegExp(escapeRegExp(org.displayName), "i")).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(new RegExp(`${role === "admin" ? "Admin" : "Member"} invite`, "i")).first()).toBeVisible({ timeout: 30_000 });
  await screenshotStep(page, testInfo, `organization-invite-${role}-menu-ready`);

  await page.getByRole("button", { name: /^accept$/i }).first().click();
  await waitForOrganizationMemberRole(page, org, memberDid, role);
  await expect(page.getByText(/no pending invitations/i)).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, `organization-invite-${role}-accepted`);
}

export async function setOrganizationMemberRole(
  page: Page,
  testInfo: TestInfo,
  org: CgsOrgMetadata,
  memberDid: string,
  role: OrganizationMemberRole,
): Promise<void> {
  await page.goto(`${groupManageBasePath(org)}/settings`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /organization settings/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Member role").first()).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, `organization-member-role-${role}-ready`);
  await page.getByLabel("Member role").first().selectOption(role);
  await waitForOrganizationMemberRole(page, org, memberDid, role);
  await screenshotStep(page, testInfo, `organization-member-role-${role}-saved`);
}

export async function expectMemberOrganizationRestrictions(page: Page, testInfo: TestInfo, org: CgsOrgMetadata): Promise<void> {
  await page.goto(groupManageBasePath(org), { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/only organization owners and admins can edit this profile/i).first()).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "organization-member-profile-restricted");

  const response = await page.request.post("/api/cgs/mutation", {
    data: {
      operation: "putRecord",
      repo: org.groupDid,
      collection: "app.bsky.actor.profile",
      rkey: "self",
      record: {
        $type: "app.bsky.actor.profile",
        displayName: "Member Should Not Rename Org",
        description: "A member should not be allowed to edit the organization profile.",
      },
    },
  });
  expect(response.ok()).toBe(false);
  const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
  expect(`${body.message ?? ""} ${body.error ?? ""}`).toMatch(/permission|forbidden|admin|owner|role/i);
  await screenshotStep(page, testInfo, "organization-member-forbidden-error-propagated");
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

  await expect(page.getByRole("button", { name: /example\.org/i }).first()).toBeVisible({ timeout: 30_000 });
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
