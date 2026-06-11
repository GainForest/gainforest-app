import { expect, test, type Page } from "@playwright/test";
import { fillBumicertForm } from "../support/creation-flow";
import {
  createProject,
  expectProjectRecordFields,
  projectItemUris,
  type CreatedProject,
} from "../support/project-flow";
import { getPdsRecord } from "../support/pds";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });
test.describe.configure({ mode: "serial" });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectProjectContainsBumicert(projectUri: string, bumicertUri: string): Promise<void> {
  await expect
    .poll(async () => projectItemUris(await getPdsRecord(projectUri)), { timeout: 90_000 })
    .toContain(bumicertUri);
}

function projectEditUrl(project: CreatedProject): string {
  return `/manage/projects?mode=edit&project=${encodeURIComponent(project.rkey)}`;
}

async function pickerButtonTexts(page: Page): Promise<string[]> {
  const picker = page.locator("section").filter({ hasText: /Bumicerts in this project/i }).first();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  return picker.getByRole("button").evaluateAll((buttons) =>
    buttons.map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

async function openProjectEditWithBumicerts(page: Page, project: CreatedProject, titles: string[]): Promise<void> {
  const deadline = Date.now() + 180_000;
  let lastTexts: string[] = [];
  let lastError: unknown = null;

  while (Date.now() <= deadline) {
    await page.goto(projectEditUrl(project), { waitUntil: "domcontentloaded" });
    try {
      await expect(page.getByRole("heading", { name: /edit project/i })).toBeVisible({ timeout: 20_000 });
      lastTexts = await pickerButtonTexts(page).catch(() => []);
      if (titles.every((title) => lastTexts.some((text) => text.includes(title)))) return;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(5_000);
  }

  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for project Bumicert picker to include ${titles.join(", ")}. Last buttons: ${lastTexts.join(" | ")}.${suffix}`);
}

test("shows updated project navigation entry points", async ({ page }) => {
  await page.goto("/manage/projects", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /my bumicerts/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /my projects/i }).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/bumicerts", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /create a project/i }).first()).toHaveAttribute(
    "href",
    /\/manage\/projects\?mode=new/,
  );
  await expect(page.getByRole("link", { name: /^create project$/i }).first()).toHaveAttribute(
    "href",
    /\/manage\/projects\?mode=new/,
  );
});

test("creates a project successfully and persists expected direct PDS fields", async ({ page }, testInfo) => {
  const project = await createProject(page, testInfo);

  expect(project.uri).toContain("/org.hypercerts.collection/");
  expect(project.rkey.length).toBeGreaterThan(0);
  await expectProjectRecordFields(project, []);
});

test("creates a project and attaches the first Bumicert from the success CTA", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const project = await createProject(page, testInfo);

  const addFirstBumicert = page.getByRole("link", { name: /add the first bumicert/i });
  await expect(addFirstBumicert).toHaveAttribute("href", /\/manage\/bumicerts\/new\?forProject=/);
  await addFirstBumicert.click();
  await page.waitForURL((url) =>
    url.pathname === "/manage/bumicerts/new" && url.searchParams.get("forProject") === project.identity,
  );

  const bumicert = await fillBumicertForm(page, testInfo, {
    forProject: project.identity,
    skipValidationEdgeCases: true,
  });
  await expectProjectContainsBumicert(project.uri, bumicert.uri);
});

test("edits a project to attach an existing Bumicert and keeps selected picker ordering stable", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const project = await createProject(page, testInfo);
  const olderBumicert = await fillBumicertForm(page, testInfo, { skipValidationEdgeCases: true });
  const newerBumicert = await fillBumicertForm(page, testInfo, { skipValidationEdgeCases: true });

  await openProjectEditWithBumicerts(page, project, [olderBumicert.title, newerBumicert.title]);
  const beforeSelectionTexts = await pickerButtonTexts(page);
  const beforeIndex = beforeSelectionTexts.findIndex((text) => text.includes(olderBumicert.title));
  expect(beforeIndex).toBeGreaterThanOrEqual(0);

  const olderButton = page.getByRole("button", { name: new RegExp(escapeRegExp(olderBumicert.title)) }).first();
  await olderButton.click();
  await expect(olderButton).toHaveAttribute("aria-pressed", "true");

  const afterSelectionTexts = await pickerButtonTexts(page);
  expect(afterSelectionTexts.findIndex((text) => text.includes(olderBumicert.title))).toBe(beforeIndex);

  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByText(/project saved successfully/i)).toBeVisible({ timeout: 120_000 });
  await expectProjectContainsBumicert(project.uri, olderBumicert.uri);

  await openProjectEditWithBumicerts(page, project, [olderBumicert.title, newerBumicert.title]);
  const reopenedTexts = await pickerButtonTexts(page);
  expect(reopenedTexts[0]).toContain(olderBumicert.title);
  await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(olderBumicert.title)) }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
