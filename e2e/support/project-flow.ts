import { expect, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { getPdsRecord, parseAtUri, trackCreatedPdsRecord, waitForProjectByTitle, type PdsRepoRecord } from "./pds";
import { groupManageBasePath, readCgsOrgMetadata } from "./cgs-org";

const E2E_PROJECT_SHORT_DESCRIPTION =
  "E2E project summary for restoration work, field evidence, and public impact review.";
const E2E_PROJECT_DESCRIPTION = "";

export type CreatedProject = {
  title: string;
  shortDescription: string;
  description: string;
  uri: string;
  cid: string;
  did: string;
  rkey: string;
  identity: string;
  record: PdsRepoRecord;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectItemUris(record: PdsRepoRecord): string[] {
  const items = Array.isArray(record.value.items) ? record.value.items : [];
  return items
    .map((item) => {
      if (!isObject(item)) return null;
      const identifier = isObject(item.itemIdentifier) ? item.itemIdentifier : item;
      return typeof identifier.uri === "string" ? identifier.uri : null;
    })
    .filter((uri): uri is string => Boolean(uri));
}

export async function expectProjectRecordFields(project: CreatedProject, expectedItems: string[] = []): Promise<void> {
  const record = await getPdsRecord(project.uri);
  expect(record.value.title).toBe(project.title);
  expect(record.value.type).toBe("project");
  expect(record.value.shortDescription).toBe(project.shortDescription);
  const description = record.value.description;
  if (project.description) {
    expect(isObject(description) ? description.value : null).toBe(project.description);
  } else {
    expect(description).toBeUndefined();
  }
  expect(projectItemUris(record)).toEqual(expectedItems);
}

async function ensureProfilePromptIsCleared(page: Page): Promise<void> {
  if (!(await page.getByRole("dialog", { name: /set up your profile/i }).isVisible({ timeout: 5_000 }).catch(() => false))) return;

  await page.goto("/manage?mode=onboard-user", { waitUntil: "domcontentloaded" });
  const form = page.locator("form:visible").first();
  if (await form.isVisible({ timeout: 20_000 }).catch(() => false)) {
    await form.getByPlaceholder(/your name/i).fill("Disposable E2E Profile Edited");
    await form.getByPlaceholder(/short introduction/i).fill("Disposable browser test profile for full end-to-end checks.");
    const response = page.waitForResponse((res) => res.request().method() !== "GET" && res.ok(), { timeout: 90_000 }).catch(() => null);
    await form.getByRole("button", { name: /^continue/i }).click();
    await response;
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
}

function manageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

export async function createProject(page: Page, testInfo: TestInfo): Promise<CreatedProject> {
  const title = `E2E Project ${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;
  const basePath = manageBasePath();

  await page.goto(`${basePath}/projects?mode=new`, { waitUntil: "domcontentloaded" });
  await ensureProfilePromptIsCleared(page);
  await page.goto(`${basePath}/projects?mode=new`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /create new project/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "project-create-empty");

  await page.locator("#project-title").fill(title);
  await page.locator("#project-summary").fill(E2E_PROJECT_SHORT_DESCRIPTION);
  const descriptionInput = page.locator("#project-description");
  if (await descriptionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await descriptionInput.fill(E2E_PROJECT_DESCRIPTION);
  }
  await screenshotStep(page, testInfo, "project-create-ready");

  await page.getByRole("button", { name: /save project/i }).click();
  await expect(page.getByText(/project saved successfully/i)).toBeVisible({ timeout: 120_000 });
  await screenshotStep(page, testInfo, "project-create-saved");

  const record = await waitForProjectByTitle(title);
  const freshRecord = await getPdsRecord(record.uri);
  trackCreatedPdsRecord(freshRecord);
  const parsed = parseAtUri(freshRecord.uri);

  return {
    title,
    shortDescription: E2E_PROJECT_SHORT_DESCRIPTION,
    description: E2E_PROJECT_DESCRIPTION,
    uri: freshRecord.uri,
    cid: freshRecord.cid,
    did: parsed.did,
    rkey: parsed.rkey,
    identity: `${parsed.did}/${parsed.rkey}`,
    record: freshRecord,
  };
}
