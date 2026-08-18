import { expect, test } from "@playwright/test";
import {
  E2E_CERT_CONTRIBUTOR,
  E2E_CERT_SCOPE,
  E2E_CERT_SHORT_DESCRIPTION,
  fillCertForm,
} from "../support/creation-flow";
import { getRecordArray } from "../support/pds";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("creates a cert successfully and persists expected direct PDS fields", async ({ page }, testInfo) => {
  const cert = await fillCertForm(page, testInfo);
  await expect(page.getByRole("link", { name: /open cert/i })).toBeVisible();

  expect(cert.uri).toContain("/org.hypercerts.claim.activity/");
  expect(cert.rkey.length).toBeGreaterThan(0);
  expect(cert.record.value.title).toBe(cert.title);
  expect(cert.record.value.shortDescription).toBe(E2E_CERT_SHORT_DESCRIPTION);
  expect(typeof cert.record.value.startDate).toBe("string");
  expect(cert.record.value.endDate).toBeUndefined();

  const workScope = cert.record.value.workScope;
  expect(isObject(workScope) ? workScope.expression : null).toContain("reforestation");
  const usedTags = isObject(workScope) ? workScope.usedTags : null;
  expect(Array.isArray(usedTags) ? usedTags.length : 0).toBeGreaterThan(0);
  expect(E2E_CERT_SCOPE).toBe("Reforestation");

  const contributors = getRecordArray(cert.record, "contributors");
  expect(
    contributors.some((contributor) => {
      const identity = contributor.contributorIdentity;
      return isObject(identity) && identity.identity === E2E_CERT_CONTRIBUTOR;
    }),
  ).toBe(true);
});
