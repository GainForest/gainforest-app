import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { cleanupCreatedPdsRecords } from "./support/pds";
import {
  clearDisposableAccountMetadataAt,
  listDisposableEmailMessages,
  disposableAccountMetadataPath,
  memberDisposableAccountMetadataPath,
  readDisposableAccountMetadataAt,
  waitForInboxDeletionToken,
  waitForInboxPasswordResetToken,
  type DisposableAccountMetadata,
} from "./support/disposable-email";
import { clearCgsOrgMetadata, groupIdentifier, readCgsOrgMetadata, type CgsOrgMetadata } from "./support/cgs-org";

const authStatePath = "e2e/.auth/user.json";
const memberAuthStatePath = "e2e/.auth/member.json";

type PdsSession = {
  did: string;
  accessJwt: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeTemporaryPassword(): string {
  return `Delete-${Date.now()}-${Math.random().toString(36).slice(2)}-Aa1!`;
}

function disposableServiceEndpoint(metadata: DisposableAccountMetadata): string {
  return (metadata.serviceEndpoint || "https://certified.one").replace(/\/$/, "");
}

async function xrpc(metadata: DisposableAccountMetadata, method: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${disposableServiceEndpoint(metadata)}/xrpc/${method}`, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) as unknown : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message = isObject(body) && typeof body.message === "string"
      ? body.message
      : isObject(body) && typeof body.error === "string"
        ? body.error
        : text || `${response.status} ${response.statusText}`;
    throw new Error(`${method} failed: ${message}`);
  }

  return body;
}

async function requestPasswordReset(metadata: DisposableAccountMetadata): Promise<void> {
  await xrpc(metadata, "com.atproto.server.requestPasswordReset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: metadata.email }),
  });
}

async function resetPassword(metadata: DisposableAccountMetadata, token: string, password: string): Promise<void> {
  await xrpc(metadata, "com.atproto.server.resetPassword", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

async function createSessionWithIdentifier(metadata: DisposableAccountMetadata, identifier: string, password: string): Promise<PdsSession> {
  const value = await xrpc(metadata, "com.atproto.server.createSession", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  if (!isObject(value) || typeof value.did !== "string" || typeof value.accessJwt !== "string") {
    throw new Error("Disposable account session response had an unexpected shape.");
  }

  return { did: value.did, accessJwt: value.accessJwt };
}

async function createSession(metadata: DisposableAccountMetadata, password: string): Promise<PdsSession> {
  return createSessionWithIdentifier(metadata, metadata.email, password);
}

async function requestAccountDelete(metadata: DisposableAccountMetadata, session: PdsSession): Promise<void> {
  await xrpc(metadata, "com.atproto.server.requestAccountDelete", {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
}

async function deleteAccount(metadata: DisposableAccountMetadata, session: PdsSession, password: string, token: string): Promise<void> {
  if (metadata.did && session.did !== metadata.did) {
    throw new Error(`Refusing to delete ${session.did}; expected ${metadata.did}.`);
  }

  await xrpc(metadata, "com.atproto.server.deleteAccount", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: session.did, password, token }),
  });
}

async function canCreateSession(metadata: DisposableAccountMetadata, password: string): Promise<boolean> {
  try {
    await createSession(metadata, password);
    return true;
  } catch {
    return false;
  }
}

async function resetDisposablePassword(metadata: DisposableAccountMetadata, password: string): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const existingMessages = await listDisposableEmailMessages(metadata.inbox);
    const ignoredMessageIds = new Set(existingMessages.map((message) => message.id));

    try {
      await requestPasswordReset(metadata);
      const resetToken = await waitForInboxPasswordResetToken(metadata.inbox, ignoredMessageIds);
      await resetPassword(metadata, resetToken, password);
      return;
    } catch (error) {
      lastError = error;
      console.log(`[e2e] Password reset attempt ${attempt} failed for ${metadata.email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not reset disposable account password.");
}

function authCookieFromStorageState(path: string): string | null {
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.cookies)) return null;
  const cookies = parsed.cookies
    .filter((cookie): cookie is Record<string, unknown> => isObject(cookie) && typeof cookie.name === "string" && typeof cookie.value === "string")
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  return cookies.length > 0 ? cookies.join("; ") : null;
}

function groupDisposableMetadata(org: CgsOrgMetadata): DisposableAccountMetadata {
  return {
    source: "disposable-email-auth",
    createdAt: org.createdAt,
    email: groupIdentifier(org),
    inbox: {
      provider: "guerrillamail",
      email: groupIdentifier(org),
      sidToken: "",
      cookie: "",
    },
    did: org.groupDid,
    handle: org.handle,
    serviceEndpoint: "https://certified.one",
  };
}

async function destroyCgsOrganization(org: CgsOrgMetadata): Promise<boolean> {
  const cookie = authCookieFromStorageState(authStatePath);
  if (!cookie) {
    console.log("[e2e] No owner auth cookie available for CGS organization destroy.");
    return false;
  }

  const baseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL ?? process.env.E2E_AUTH_BASE_URL ?? "https://dev.auth.gainforest.app";
  const payloads = [
    { operation: "destroyGroup", repo: org.groupDid },
    { operation: "destroy", repo: org.groupDid },
    { operation: "group.destroy", repo: org.groupDid },
  ];
  let lastMessage = "";

  for (const payload of payloads) {
    const response = await fetch(new URL("/api/cgs/mutation", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(payload),
    }).catch((error: unknown) => {
      lastMessage = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (!response) continue;
    const text = await response.text().catch(() => "");
    if (response.ok) {
      console.log(`[e2e] Destroyed CGS organization state for ${org.groupDid}.`);
      return true;
    }
    lastMessage = text || `${response.status} ${response.statusText}`;
  }

  console.log(`[e2e] CGS organization destroy did not complete for ${org.groupDid}: ${lastMessage}`);
  return false;
}

async function deleteCgsOrganizationAccount(): Promise<void> {
  const org = readCgsOrgMetadata();
  if (!org) {
    console.log("[e2e] No CGS organization metadata found; nothing to delete.");
    return;
  }

  let pdsAccountDeleted = false;

  if (org.accountPassword) {
    const owner = readDisposableAccountMetadataAt(disposableAccountMetadataPath);
    if (owner) {
      try {
        const groupMetadata = groupDisposableMetadata(org);
        const session = await createSessionWithIdentifier(groupMetadata, groupIdentifier(org), org.accountPassword);
        if (session.did !== org.groupDid) throw new Error(`Refusing to delete ${session.did}; expected ${org.groupDid}.`);
        const ignoredMessageIds = new Set((await listDisposableEmailMessages(owner.inbox)).map((message) => message.id));
        await requestAccountDelete(groupMetadata, session);
        const deletionToken = await waitForInboxDeletionToken(owner.inbox, ignoredMessageIds, 45_000);
        await deleteAccount(groupMetadata, session, org.accountPassword, deletionToken);
        pdsAccountDeleted = true;
        console.log(`[e2e] Deleted CGS organization PDS account ${org.groupDid}.`);
      } catch (error) {
        console.log(`[e2e] CGS organization PDS account deletion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    console.log(`[e2e] No CGS organization account password captured for ${org.groupDid}; skipping PDS account deletion.`);
  }

  const cgsDestroyed = await destroyCgsOrganization(org);
  if (pdsAccountDeleted && cgsDestroyed) {
    await clearCgsOrgMetadata();
  } else {
    console.log(`[e2e] Keeping CGS organization metadata for inspection/retry (${org.groupDid}).`);
  }
}

async function deleteDisposableAccountFromPath(metadataPath: string, authState: string, label: string): Promise<void> {
  const metadata = readDisposableAccountMetadataAt(metadataPath);
  if (!metadata) {
    console.log(`[e2e] No ${label} disposable account metadata found; nothing to delete.`);
    return;
  }

  if (!metadata.did) {
    console.log(`[e2e] ${label} disposable account ${metadata.email} never completed sign-in; clearing metadata only.`);
    await clearDisposableAccountMetadataAt(metadataPath);
    await rm(authState, { force: true });
    return;
  }

  if (!metadata.email.endsWith("@guerrillamailblock.com")) {
    throw new Error(`Refusing to delete non-disposable E2E account ${metadata.email}.`);
  }

  const password = makeTemporaryPassword();

  console.log(`[e2e] Resetting password before deleting ${label} disposable account ${metadata.email}.`);
  await resetDisposablePassword(metadata, password);

  const afterResetMessages = await listDisposableEmailMessages(metadata.inbox);
  const ignoredMessageIds = new Set(afterResetMessages.map((message) => message.id));

  const session = await createSession(metadata, password);
  await requestAccountDelete(metadata, session);
  const deletionToken = await waitForInboxDeletionToken(metadata.inbox, ignoredMessageIds);
  await deleteAccount(metadata, session, password, deletionToken);

  if (await canCreateSession(metadata, password)) {
    throw new Error(`Disposable account deletion did not take effect for ${metadata.email}.`);
  }

  await clearDisposableAccountMetadataAt(metadataPath);
  await rm(authState, { force: true });
  console.log(`[e2e] Deleted ${label} disposable account ${session.did} (${metadata.email}).`);
}

async function globalTeardown(): Promise<void> {
  const result = await cleanupCreatedPdsRecords();
  console.log(
    `[e2e] Deleted ${result.deleted} test Cert record(s)${result.skipped ? `; disposable records are handled by account deletion (${result.skipped} tracked)` : ""}${result.failed ? `; ${result.failed} failed` : ""}.`,
  );

  try {
    await deleteCgsOrganizationAccount();
    await deleteDisposableAccountFromPath(memberDisposableAccountMetadataPath, memberAuthStatePath, "member");
    await deleteDisposableAccountFromPath(disposableAccountMetadataPath, authStatePath, "owner");
  } catch (error) {
    console.log(`[e2e] Disposable account deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default globalTeardown;
