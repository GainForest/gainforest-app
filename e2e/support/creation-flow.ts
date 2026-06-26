import { expect, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { getPdsRecord, parseAtUri, trackCreatedPdsRecord, waitForClaimActivityByTitle, type PdsRepoRecord } from "./pds";
import { groupManageBasePath, readCgsOrgMetadata } from "./cgs-org";

export const E2E_CERT_SCOPE = "Reforestation";
export const E2E_CERT_SHORT_DESCRIPTION =
  "E2E restoration impact summary with field-ready details for reviewers.";
export const E2E_CERT_CONTRIBUTOR = "E2E Steward Organization";

export type CreatedCert = {
  title: string;
  uri: string;
  cid: string;
  did: string;
  rkey: string;
  record: PdsRepoRecord;
};

export type FillCertFormOptions = {
  forProject?: string;
  skipValidationEdgeCases?: boolean;
};

const publishButtonName = /^publish(?: cert| to the project)?$/i;

function manageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

function newCertUrl(options: FillCertFormOptions): string {
  const basePath = manageBasePath();
  // Certs are minted from a project: hitting /certs/new with no project now
  // shows a project chooser. forProject binds a project; noProject=1 is the
  // explicit "mint without linking" path that lands straight on the form.
  return options.forProject
    ? `${basePath}/certs/new?forProject=${encodeURIComponent(options.forProject)}`
    : `${basePath}/certs/new?noProject=1`;
}

export async function expectCertPublishValidationEdgeCases(page: Page, testInfo: TestInfo): Promise<void> {
  await page.getByRole("button", { name: publishButtonName }).click();
  await expect(page.getByText(/add a title with at least 4 characters/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/pick at least one type of work/i).first()).toBeVisible();
  await expect(page.getByText(/write at least 30 characters for the summary/i).first()).toBeVisible();
  await expect(page.getByText(/write at least 80 characters for the full description/i).first()).toBeVisible();
  await expect(page.getByText(/add at least one person or group/i).first()).toBeVisible();
  await expect(page.getByText(/confirm you have permission/i).first()).toBeVisible();
  await expect(page.getByText(/agree to the terms before publishing/i).first()).toBeVisible();
  await screenshotStep(page, testInfo, "create-empty-publish-errors");

  await page.locator("#cert-title").first().fill("Bad");
  await page.getByRole("button", { name: E2E_CERT_SCOPE }).first().click();
  await page.locator("#summary").first().fill("Too short");
  await page.locator("#description").first().fill("Also too short.");
  await page.getByPlaceholder(/search e\.g\.|name or/i).first().fill("");
  await page.getByRole("button", { name: publishButtonName }).click();
  await expect(page.getByText(/add a title with at least 4 characters/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/write at least 30 characters for the summary/i).first()).toBeVisible();
  await expect(page.getByText(/write at least 80 characters for the full description/i).first()).toBeVisible();
  await screenshotStep(page, testInfo, "create-short-content-publish-errors");
}

export async function fillCertForm(page: Page, testInfo: TestInfo, options: FillCertFormOptions = {}): Promise<CreatedCert> {
  const title = `E2E Cert ${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;

  await page.goto(newCertUrl(options), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /the basics/i }).first()).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "create-form-empty");
  if (!options.skipValidationEdgeCases) await expectCertPublishValidationEdgeCases(page, testInfo);

  await page.locator("#cert-title").first().fill(title);
  if (options.skipValidationEdgeCases) await page.getByRole("button", { name: E2E_CERT_SCOPE }).first().click();
  await screenshotStep(page, testInfo, "create-basics-complete");

  await page.locator("#summary").first().fill(E2E_CERT_SHORT_DESCRIPTION);
  await page.locator("#description").first().fill(
    "This E2E Cert documents restoration work with durable local benefits, clear field evidence, practical follow-up notes, and a simple story that reviewers can understand quickly.",
  );
  await screenshotStep(page, testInfo, "create-story-complete");

  await page.getByPlaceholder(/search e\.g\.|name or/i).first().fill(E2E_CERT_CONTRIBUTOR);
  await screenshotStep(page, testInfo, "create-people-complete");

  await page.locator("label").filter({ hasText: /I confirm I have permission/i }).first().click();
  await page.locator("label").filter({ hasText: /I agree to the/i }).first().click();
  await screenshotStep(page, testInfo, "create-ready-to-publish");

  await page.getByRole("button", { name: publishButtonName }).click();
  await expect(page.getByText(/it’s live|it's live/i).first()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole("link", { name: /open cert/i })).toBeVisible({ timeout: 10_000 });
  await screenshotStep(page, testInfo, "create-published-successfully");

  const record = await waitForClaimActivityByTitle(title);
  const freshRecord = await getPdsRecord(record.uri);
  trackCreatedPdsRecord(freshRecord);
  const parsed = parseAtUri(freshRecord.uri);

  return {
    title,
    uri: freshRecord.uri,
    cid: freshRecord.cid,
    did: parsed.did,
    rkey: parsed.rkey,
    record: freshRecord,
  };
}
