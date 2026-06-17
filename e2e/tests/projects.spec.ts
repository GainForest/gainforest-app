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

async function expectProjectContainsCert(projectUri: string, certUri: string): Promise<void> {
  await expect
    .poll(async () => projectItemUris(await getPdsRecord(projectUri)), { timeout: 90_000 })
    .toContain(certUri);
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

  const addFirstCert = page.getByRole("link", { name: /add the first cert/i });
  const org = readCgsOrgMetadata();
  const basePath = org ? groupManageBasePath(org) : "/manage";
  await expect(addFirstCert).toHaveAttribute("href", new RegExp(`${basePath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}/certs/new\\?forProject=`));
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
