import { expect, test } from "@playwright/test";
import { fillCertForm } from "../support/creation-flow";
import {
  createProject,
  expectProjectRecordFields,
  projectItemUris,
} from "../support/project-flow";
import { getPdsRecord } from "../support/pds";
import { groupManageBasePath, readCgsOrgMetadata } from "../support/cgs-org";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });
test.describe.configure({ mode: "serial" });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentManageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

async function expectProjectContainsCert(projectUri: string, certUri: string): Promise<void> {
  await expect
    .poll(async () => projectItemUris(await getPdsRecord(projectUri)), { timeout: 90_000 })
    .toContain(certUri);
}

async function expectProjectExcludesCert(projectUri: string, certUri: string): Promise<void> {
  await expect
    .poll(async () => projectItemUris(await getPdsRecord(projectUri)), { timeout: 90_000 })
    .not.toContain(certUri);
}

test("creates a project successfully and persists expected direct PDS fields", async ({ page }, testInfo) => {
  const project = await createProject(page, testInfo);

  expect(project.uri).toContain("/org.hypercerts.collection/");
  expect(project.rkey.length).toBeGreaterThan(0);
  await expectProjectRecordFields(project, []);
});

test("creates a project and attaches the first Cert from the success CTA", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const project = await createProject(page, testInfo);

  const addFirstCert = page.getByRole("link", { name: /mint your first cert/i });
  const basePath = currentManageBasePath();
  await expect(addFirstCert).toHaveAttribute("href", new RegExp(`${escapeRegExp(basePath)}/certs/new\\?forProject=`));
  await Promise.all([
    page.waitForURL((url) =>
      url.pathname.endsWith(`${basePath}/certs/new`) && url.searchParams.get("forProject") === project.identity,
    ),
    addFirstCert.click(),
  ]);

  const cert = await fillCertForm(page, testInfo, {
    forProject: project.identity,
    skipValidationEdgeCases: true,
  });
  await expectProjectContainsCert(project.uri, cert.uri);
});

test("links, unlinks, and relinks an existing Cert from project Cert management", async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  const project = await createProject(page, testInfo);
  const cert = await fillCertForm(page, testInfo, { skipValidationEdgeCases: true });
  const basePath = currentManageBasePath();

  await page.goto(`${basePath}/projects`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/search projects/i).fill(project.title);
  const projectCard = page.locator("article").filter({ hasText: project.title }).first();
  await expect(projectCard).toBeVisible({ timeout: 60_000 });
  const manageCertsLink = projectCard.getByRole("link", {
    name: new RegExp(`certs for ${escapeRegExp(project.title)}`, "i"),
  });
  await expect(manageCertsLink).toHaveAttribute("href", `${basePath}/projects/${encodeURIComponent(project.rkey)}/certs`);
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith(`${basePath}/projects/${project.rkey}/certs`)),
    manageCertsLink.click(),
  ]);

  await expect(page.getByRole("heading", { name: project.title })).toBeVisible({ timeout: 60_000 });
  // The Cert was minted without a project, so it starts in the secondary
  // "Link an existing Cert" panel. Reveal it, then link it to the project.
  await page.getByRole("button", { name: /link an existing cert/i }).first().click();
  await page.getByLabel(/search certs/i).fill(cert.title);
  const certTile = page.getByRole("listitem").filter({ hasText: cert.title }).first();
  await expect(certTile).toBeVisible({ timeout: 90_000 });

  await certTile.getByRole("button", { name: /^link$/i }).click();
  await expect(certTile.getByText(/^linked$/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /refresh/i })).toBeEnabled({ timeout: 90_000 });
  await expectProjectContainsCert(project.uri, cert.uri);

  await certTile.getByRole("button", { name: /^unlink$/i }).click();
  await expect(page.getByRole("button", { name: /refresh/i })).toBeEnabled({ timeout: 90_000 });
  await expect(certTile.getByRole("button", { name: /^link$/i })).toBeVisible({ timeout: 30_000 });
  await expectProjectExcludesCert(project.uri, cert.uri);

  await certTile.getByRole("button", { name: /^link$/i }).click();
  await expect(certTile.getByText(/^linked$/i)).toBeVisible({ timeout: 30_000 });
  await expectProjectContainsCert(project.uri, cert.uri);
});
