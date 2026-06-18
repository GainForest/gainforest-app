import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test } from "@playwright/test";
import { signInWithDisposableEmailAccount } from "../support/auth-flow";
import { memberDisposableAccountMetadataPath } from "../support/disposable-email";
import { readCgsOrgMetadata } from "../support/cgs-org";
import { getE2EEnv } from "../support/env";
import {
  addOrganizationMember,
  completeUserOnboarding,
  expectMemberOrganizationRestrictions,
  setOrganizationMemberRole,
} from "../support/manage-flow";

const ownerAuthStatePath = "e2e/.auth/user.json";
const memberAuthStatePath = "e2e/.auth/member.json";

test.use({ storageState: ownerAuthStatePath });

test("adds a disposable admin, downgrades to member, and verifies member-only CGS permissions", async ({ browser, page }, testInfo) => {
  test.setTimeout(420_000);
  const env = getE2EEnv();
  const contextOptions = {
    baseURL: env.appUrl,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: process.env.VERCEL_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_SECRET }
      : undefined,
  };
  const org = readCgsOrgMetadata();
  if (!org) throw new Error("CGS organization metadata is required before member permission checks.");

  const memberContext = await browser.newContext(contextOptions);
  const memberPage = await memberContext.newPage();
  const member = await signInWithDisposableEmailAccount(memberPage, testInfo, {
    metadataPath: memberDisposableAccountMetadataPath,
    labelPrefix: "auth-member-disposable",
  });
  await completeUserOnboarding(memberPage, testInfo, {
    displayName: "Disposable E2E Member",
    description: "Disposable member account used for CGS role permission checks.",
  });
  await mkdir(dirname(memberAuthStatePath), { recursive: true });
  await memberContext.storageState({ path: memberAuthStatePath });
  await memberContext.close();

  const memberIdentifier = member.handle ?? member.did;
  expect(memberIdentifier).toBeTruthy();
  if (!memberIdentifier || !member.did) throw new Error("Disposable member account did not return an identifier.");
  await addOrganizationMember(page, testInfo, org, memberIdentifier, member.did, "admin");
  await setOrganizationMemberRole(page, testInfo, org, member.did, "member");

  const restrictedContext = await browser.newContext({ ...contextOptions, storageState: memberAuthStatePath });
  const restrictedPage = await restrictedContext.newPage();
  await expectMemberOrganizationRestrictions(restrictedPage, testInfo, org);
  await restrictedContext.close();
});
