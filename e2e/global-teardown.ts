import { rm } from "node:fs/promises";
import { cleanupCreatedPdsRecords } from "./support/pds";
import {
  clearDisposableAccountMetadata,
  listDisposableEmailMessages,
  readDisposableAccountMetadata,
  waitForInboxDeletionToken,
  waitForInboxPasswordResetToken,
  type DisposableAccountMetadata,
} from "./support/disposable-email";

const authStatePath = "e2e/.auth/user.json";

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

async function createSession(metadata: DisposableAccountMetadata, password: string): Promise<PdsSession> {
  const value = await xrpc(metadata, "com.atproto.server.createSession", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: metadata.email, password }),
  });

  if (!isObject(value) || typeof value.did !== "string" || typeof value.accessJwt !== "string") {
    throw new Error("Disposable account session response had an unexpected shape.");
  }

  return { did: value.did, accessJwt: value.accessJwt };
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

async function deleteDisposableAccount(): Promise<void> {
  const metadata = readDisposableAccountMetadata();
  if (!metadata) {
    console.log("[e2e] No disposable account metadata found; nothing to delete.");
    return;
  }

  if (!metadata.email.endsWith("@guerrillamailblock.com")) {
    throw new Error(`Refusing to delete non-disposable E2E account ${metadata.email}.`);
  }

  const password = makeTemporaryPassword();

  console.log(`[e2e] Resetting password before deleting disposable account ${metadata.email}.`);
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

  await clearDisposableAccountMetadata();
  await rm(authStatePath, { force: true });
  console.log(`[e2e] Deleted disposable account ${session.did} (${metadata.email}).`);
}

async function globalTeardown(): Promise<void> {
  const result = await cleanupCreatedPdsRecords();
  console.log(
    `[e2e] Deleted ${result.deleted} test Bumicert record(s)${result.skipped ? `; disposable records are handled by account deletion (${result.skipped} tracked)` : ""}${result.failed ? `; ${result.failed} failed` : ""}.`,
  );

  try {
    await deleteDisposableAccount();
  } catch (error) {
    console.log(`[e2e] Disposable account deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export default globalTeardown;
