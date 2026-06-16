import { expect, test } from "@playwright/test";
import { fillBumicertForm } from "../support/creation-flow";
import {
  createProject,
  expectProjectRecordFields,
  projectItemUris,
} from "../support/project-flow";
import { getPdsRecord } from "../support/pds";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });
test.describe.configure({ mode: "serial" });

async function expectProjectContainsBumicert(projectUri: string, bumicertUri: string): Promise<void> {
  await expect
    .poll(async () => projectItemUris(await getPdsRecord(projectUri)), { timeout: 90_000 })
    .toContain(bumicertUri);
}

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
  await Promise.all([
    page.waitForURL((url) =>
      url.pathname.endsWith("/manage/bumicerts/new") && url.searchParams.get("forProject") === project.identity,
    ),
    addFirstBumicert.click(),
  ]);

  const bumicert = await fillBumicertForm(page, testInfo, {
    forProject: project.identity,
    skipValidationEdgeCases: true,
  });
  await expectProjectContainsBumicert(project.uri, bumicert.uri);
});
