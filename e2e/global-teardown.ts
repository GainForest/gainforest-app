import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { cleanupCreatedPdsRecords } from "./support/pds";
import {
  listDisposableEmailMessages,
  disposableAccountMetadataPath,
  memberDisposableAccountMetadataPath,
  readDisposableAccountMetadataAt,
  waitForInboxDeletionToken,
  waitForInboxPasswordResetToken,
  writeDisposableAccountMetadataAt,
  type DisposableAccountMetadata,
  type DisposableInbox,
} from "./support/disposable-email";
import { cgsOrgMetadataPath, groupIdentifier, patchCgsOrgMetadata, readCgsOrgMetadata, type CgsOrgMetadata } from "./support/cgs-org";
import { getE2EEnv } from "./support/env";

const authStatePath = "e2e/.auth/user.json";
const memberAuthStatePath = "e2e/.auth/member.json";
const cleanupSmokeReportPath = "reports/e2e/cleanup-smoke.json";

type PdsSession = {
  did: string;
  accessJwt: string;
};

type CleanupAccount = {
  did: string;
  handle: string | null;
  email: string;
  inbox: DisposableInbox;
  serviceEndpoint: string;
  password?: string | null;
};

const cleanupStartedAt = Date.now();
let cleanupRequestSequence = 0;

// Intentionally verbose: if mandatory teardown misses a PDS account, the test
// run leaves temp-email-owned data behind. Re-running the suite can pollute the
// PDS further and the chance of later recovery drops as temporary inboxes expire,
// so these logs must be enough to root-cause the first failing cleanup run ASAP.
function cleanupLog(message: string, details?: Record<string, unknown>): void {
  const suffix = details && Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`[e2e][cleanup +${Date.now() - cleanupStartedAt}ms] ${message}${suffix}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeSnippet(value: unknown, maxLength = 1_200): string {
  const text = typeof value === "string" ? value : JSON.stringify(redactSensitive(value));
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!isObject(value)) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/password|token|jwt|authorization|cookie|secret/i.test(key)) {
      redacted[key] = typeof entry === "string" ? `[redacted:${entry.length} chars]` : "[redacted]";
    } else {
      redacted[key] = redactSensitive(entry);
    }
  }
  return redacted;
}

function cleanupAccountDetails(account: CleanupAccount): Record<string, unknown> {
  return {
    did: account.did,
    handle: account.handle,
    email: account.email,
    inboxProvider: account.inbox.provider,
    inboxEmail: account.inbox.email,
    serviceEndpoint: account.serviceEndpoint,
    hasPersistedPassword: Boolean(account.password),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function now(): string {
  return new Date().toISOString();
}

function makeTemporaryPassword(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}-Aa1!`;
}

function normalizeEndpoint(endpoint: string | null | undefined): string {
  const env = getE2EEnv();
  const fallback = env.testPdsDomain
    ? env.testPdsDomain.startsWith("http") ? env.testPdsDomain : `https://${env.testPdsDomain}`
    : "https://dev.certified.app";
  return (endpoint || fallback).replace(/\/$/, "");
}

function disposableServiceEndpoint(metadata: DisposableAccountMetadata): string {
  return normalizeEndpoint(metadata.serviceEndpoint);
}

async function fetchText(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; text: string; body: unknown }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) as unknown : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, text, body };
}

async function xrpcEndpoint(endpoint: string, method: string, init: RequestInit = {}): Promise<unknown> {
  const requestId = ++cleanupRequestSequence;
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const requestMethod = init.method ?? "GET";
  cleanupLog("XRPC request starting", { requestId, requestMethod, xrpcMethod: method, endpoint: normalizedEndpoint });

  let response: Awaited<ReturnType<typeof fetchText>>;
  try {
    response = await fetchText(`${normalizedEndpoint}/xrpc/${method}`, init);
  } catch (error) {
    cleanupLog("XRPC request transport failure", { requestId, xrpcMethod: method, error: errorMessage(error) });
    throw error;
  }

  cleanupLog("XRPC request completed", { requestId, xrpcMethod: method, status: response.status, ok: response.ok });
  if (!response.ok) {
    const message = isObject(response.body) && typeof response.body.message === "string"
      ? response.body.message
      : isObject(response.body) && typeof response.body.error === "string"
        ? response.body.error
        : response.text || `${response.status}`;
    cleanupLog("XRPC request failure body", { requestId, xrpcMethod: method, body: safeSnippet(response.body ?? response.text) });
    throw new Error(`${method} failed: ${message}`);
  }
  return response.body;
}

async function xrpcMetadata(metadata: DisposableAccountMetadata, method: string, init: RequestInit = {}): Promise<unknown> {
  return xrpcEndpoint(disposableServiceEndpoint(metadata), method, init);
}

async function requestPasswordReset(account: CleanupAccount): Promise<void> {
  cleanupLog("Requesting password reset email", cleanupAccountDetails(account));
  await xrpcEndpoint(account.serviceEndpoint, "com.atproto.server.requestPasswordReset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: account.email }),
  });
  cleanupLog("Password reset request accepted", { did: account.did, email: account.email });
}

async function resetPassword(account: CleanupAccount, token: string, password: string): Promise<void> {
  cleanupLog("Resetting cleanup password with inbox token", { did: account.did, tokenLength: token.length, passwordLength: password.length });
  await xrpcEndpoint(account.serviceEndpoint, "com.atproto.server.resetPassword", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  cleanupLog("Cleanup password reset completed", { did: account.did });
}

async function createSessionWithIdentifier(account: CleanupAccount, identifier: string, password: string): Promise<PdsSession> {
  cleanupLog("Creating cleanup PDS session", { did: account.did, identifier, serviceEndpoint: account.serviceEndpoint, passwordLength: password.length });
  const value = await xrpcEndpoint(account.serviceEndpoint, "com.atproto.server.createSession", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  if (!isObject(value) || typeof value.did !== "string" || typeof value.accessJwt !== "string") {
    cleanupLog("Cleanup PDS session response had unexpected shape", { did: account.did, response: safeSnippet(value) });
    throw new Error("PDS session response had an unexpected shape.");
  }

  cleanupLog("Cleanup PDS session created", { expectedDid: account.did, sessionDid: value.did, accessJwtLength: value.accessJwt.length });
  return { did: value.did, accessJwt: value.accessJwt };
}

async function requestAccountDelete(account: CleanupAccount, session: PdsSession): Promise<void> {
  cleanupLog("Requesting account deletion email", { did: account.did, sessionDid: session.did, serviceEndpoint: account.serviceEndpoint });
  await xrpcEndpoint(account.serviceEndpoint, "com.atproto.server.requestAccountDelete", {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  cleanupLog("Account deletion request accepted", { did: account.did });
}

async function deleteAccount(account: CleanupAccount, session: PdsSession, password: string, token: string): Promise<void> {
  cleanupLog("Submitting final PDS account deletion", { did: account.did, sessionDid: session.did, tokenLength: token.length, passwordLength: password.length });
  if (session.did !== account.did) {
    cleanupLog("Refusing unsafe account deletion because session DID did not match target DID", { expectedDid: account.did, sessionDid: session.did });
    throw new Error(`Refusing to delete ${session.did}; expected ${account.did}.`);
  }

  await xrpcEndpoint(account.serviceEndpoint, "com.atproto.server.deleteAccount", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: session.did, password, token }),
  });
  cleanupLog("Final PDS account deletion accepted", { did: account.did });
}

async function canCreateSession(account: CleanupAccount, identifier: string, password: string): Promise<boolean> {
  try {
    await createSessionWithIdentifier(account, identifier, password);
    cleanupLog("Verification probe: session can still be created", { did: account.did, identifier });
    return true;
  } catch (error) {
    cleanupLog("Verification probe: session creation rejected", { did: account.did, identifier, error: errorMessage(error) });
    return false;
  }
}

async function repoExists(account: CleanupAccount): Promise<boolean> {
  const params = new URLSearchParams({ repo: account.did });
  const url = `${account.serviceEndpoint}/xrpc/com.atproto.repo.describeRepo?${params.toString()}`;
  try {
    const response = await fetch(url);
    const text = await response.text().catch(() => "");
    cleanupLog("Verification probe: describeRepo response", { did: account.did, status: response.status, ok: response.ok, body: response.ok ? "" : safeSnippet(text) });
    return response.ok;
  } catch (error) {
    cleanupLog("Verification probe: describeRepo transport failure", { did: account.did, error: errorMessage(error) });
    return false;
  }
}

async function handleStillPointsToAccount(account: CleanupAccount): Promise<boolean> {
  if (!account.handle) {
    cleanupLog("Verification probe: no handle recorded for account", { did: account.did });
    return false;
  }

  const params = new URLSearchParams({ handle: account.handle });
  const url = `${account.serviceEndpoint}/xrpc/com.atproto.identity.resolveHandle?${params.toString()}`;
  try {
    const response = await fetch(url);
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      cleanupLog("Verification probe: resolveHandle rejected", { did: account.did, handle: account.handle, status: response.status, body: safeSnippet(text) });
      return false;
    }

    const body = text ? JSON.parse(text) as unknown : null;
    const resolvedDid = isObject(body) && typeof body.did === "string" ? body.did : null;
    const pointsHere = resolvedDid === account.did;
    cleanupLog("Verification probe: resolveHandle response", { did: account.did, handle: account.handle, resolvedDid, pointsHere });
    return pointsHere;
  } catch (error) {
    cleanupLog("Verification probe: resolveHandle failure", { did: account.did, handle: account.handle, error: errorMessage(error) });
    return false;
  }
}

async function verifyAccountGone(account: CleanupAccount, identifier: string, password: string | null | undefined, label: string): Promise<void> {
  const timeoutMs = 90_000;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let latest = "";
  let attempt = 0;
  cleanupLog("Starting mandatory PDS account deletion verification", { label, identifier, timeoutMs, ...cleanupAccountDetails(account) });

  while (Date.now() <= deadline) {
    attempt += 1;
    cleanupLog("Verification attempt starting", { label, did: account.did, attempt, remainingMs: Math.max(0, deadline - Date.now()) });
    const sessionOk = password ? await canCreateSession(account, identifier, password) : false;
    const describeOk = await repoExists(account);
    const handleOk = await handleStillPointsToAccount(account);
    latest = `sessionOk=${sessionOk} describeOk=${describeOk} handleStillPointsHere=${handleOk}`;
    cleanupLog("Verification attempt completed", { label, did: account.did, attempt, sessionOk, describeOk, handleOk, latest });
    if (!sessionOk && !describeOk && !handleOk) {
      cleanupLog("Mandatory PDS account deletion verification succeeded", { label, did: account.did, attempts: attempt, elapsedMs: Date.now() - startedAt });
      console.log(`[e2e] Verified ${label} PDS account is gone (${account.did}).`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  cleanupLog("Mandatory PDS account deletion verification timed out", { label, did: account.did, attempts: attempt, latest });
  throw new Error(`Timed out verifying ${label} deletion for ${account.did}: ${latest}`);
}

async function establishPassword(
  account: CleanupAccount,
  label: string,
  onPatch: (patch: { password?: string; passwordResetToken?: string; cleanupError?: string | null }) => Promise<void>,
): Promise<string> {
  cleanupLog("Ensuring cleanup password is available", { label, ...cleanupAccountDetails(account) });
  if (account.password) {
    cleanupLog("Reusing persisted cleanup password", { label, did: account.did, passwordLength: account.password.length });
    return account.password;
  }

  const password = makeTemporaryPassword(`${label}Delete`);
  cleanupLog("Generated temporary cleanup password and persisting it before reset", { label, did: account.did, passwordLength: password.length });
  await onPatch({ password });
  cleanupLog("Cleanup password persisted before reset email request", { label, did: account.did });

  const inboxMessages = await listDisposableEmailMessages(account.inbox);
  const ignoredMessageIds = new Set(inboxMessages.map((message) => message.id));
  cleanupLog("Captured pre-reset inbox baseline", { label, did: account.did, inboxProvider: account.inbox.provider, ignoredMessageCount: ignoredMessageIds.size, subjects: inboxMessages.map((message) => message.subject || message.id).slice(-10) });
  await requestPasswordReset(account);
  cleanupLog("Waiting for password reset token in disposable inbox", { label, did: account.did, inboxEmail: account.inbox.email });
  const resetToken = await waitForInboxPasswordResetToken(account.inbox, ignoredMessageIds);
  cleanupLog("Received password reset token", { label, did: account.did, tokenLength: resetToken.length });
  await onPatch({ password, passwordResetToken: resetToken });
  cleanupLog("Persisted password reset token for manual recovery", { label, did: account.did, tokenLength: resetToken.length });
  await resetPassword(account, resetToken, password);
  return password;
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

async function destroyCgsOrganization(org: CgsOrgMetadata): Promise<void> {
  cleanupLog("Starting CGS service-state destroy step", {
    metadataPath: cgsOrgMetadataPath,
    groupDid: org.groupDid,
    handle: org.handle,
    destroyedAt: org.destroyedAt,
    serviceEndpoint: org.serviceEndpoint,
  });
  if (org.destroyedAt) {
    cleanupLog("Skipping CGS destroy because metadata already records destroyedAt", { groupDid: org.groupDid, destroyedAt: org.destroyedAt });
    return;
  }

  const cookie = authCookieFromStorageState(authStatePath);
  if (!cookie) {
    cleanupLog("No owner auth cookie available for CGS destroy; continuing with PDS account deletion", { groupDid: org.groupDid, authStatePath });
    console.log("[e2e] No owner auth cookie available for CGS destroy; continuing with PDS account deletion.");
    return;
  }

  const baseUrl = getE2EEnv().authBaseUrl;
  const url = new URL("/api/cgs/mutation", baseUrl);
  cleanupLog("Sending CGS destroy request", { groupDid: org.groupDid, url: url.toString(), cookieLength: cookie.length });
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ operation: "destroyGroup", repo: org.groupDid }),
  }).catch((error: unknown) => {
    cleanupLog("CGS destroy request transport failure", { groupDid: org.groupDid, error: errorMessage(error) });
    console.log(`[e2e] CGS destroy request failed: ${errorMessage(error)}`);
    return null;
  });

  if (!response) return;
  const text = await response.text().catch(() => "");
  cleanupLog("CGS destroy response received", { groupDid: org.groupDid, status: response.status, ok: response.ok, body: safeSnippet(text) });
  if (response.ok || /unknown group|not found|already/i.test(text)) {
    await patchCgsOrgMetadata({ destroyedAt: now(), cleanupError: null });
    cleanupLog("Recorded CGS service-state destroy success", { groupDid: org.groupDid, metadataPath: cgsOrgMetadataPath });
    console.log(`[e2e] Destroyed CGS service state for ${org.groupDid}.`);
    return;
  }

  cleanupLog("CGS destroy did not complete; PDS account deletion will still be attempted", { groupDid: org.groupDid, status: response.status, body: safeSnippet(text) });
  console.log(`[e2e] CGS destroy did not complete for ${org.groupDid}: ${response.status} ${text}`);
}

async function deleteCgsOrganizationAccount(): Promise<void> {
  cleanupLog("Loading CGS organization cleanup metadata", { metadataPath: cgsOrgMetadataPath });
  const org = readCgsOrgMetadata();
  if (!org) {
    cleanupLog("No CGS organization metadata found; nothing to delete", { metadataPath: cgsOrgMetadataPath });
    console.log("[e2e] No CGS organization metadata found; nothing to delete.");
    return;
  }

  cleanupLog("CGS organization cleanup metadata loaded", {
    groupDid: org.groupDid,
    handle: org.handle,
    ownerDid: org.ownerDid,
    serviceEndpoint: org.serviceEndpoint,
    recoveryEmail: org.recoveryEmail,
    recoveryInboxProvider: org.recoveryInbox?.provider,
    hasAccountPassword: Boolean(org.accountPassword),
    destroyedAt: org.destroyedAt,
    deletedAt: org.deletedAt,
    verifiedGoneAt: org.verifiedGoneAt,
    cleanupError: org.cleanupError,
  });

  try {
    await destroyCgsOrganization(org);
    const latest = readCgsOrgMetadata() ?? org;
    cleanupLog("Reloaded CGS organization metadata after destroy attempt", {
      groupDid: latest.groupDid,
      destroyedAt: latest.destroyedAt,
      deletedAt: latest.deletedAt,
      verifiedGoneAt: latest.verifiedGoneAt,
      cleanupError: latest.cleanupError,
    });
    if (latest.verifiedGoneAt) {
      cleanupLog("Skipping CGS organization account deletion because metadata already records verification", { groupDid: latest.groupDid, verifiedGoneAt: latest.verifiedGoneAt });
      return;
    }

    const owner = readDisposableAccountMetadataAt(disposableAccountMetadataPath);
    cleanupLog("Loaded owner metadata for CGS recovery fallback", {
      ownerMetadataPath: disposableAccountMetadataPath,
      ownerDid: owner?.did,
      ownerEmail: owner?.email,
      ownerInboxProvider: owner?.inbox.provider,
      ownerServiceEndpoint: owner?.serviceEndpoint,
    });
    const recoveryInbox = latest.recoveryInbox ?? owner?.inbox;
    const recoveryEmail = latest.recoveryEmail ?? owner?.email;
    if (!recoveryInbox || !recoveryEmail) {
      cleanupLog("Missing CGS recovery inbox/email; cannot safely delete group PDS account", { groupDid: latest.groupDid, hasRecoveryInbox: Boolean(recoveryInbox), recoveryEmail });
      throw new Error("Missing recovery inbox/email for CGS organization cleanup.");
    }

    const account: CleanupAccount = {
      did: latest.groupDid,
      handle: latest.handle,
      email: recoveryEmail,
      inbox: recoveryInbox,
      serviceEndpoint: normalizeEndpoint(latest.serviceEndpoint ?? owner?.serviceEndpoint),
      password: latest.accountPassword,
    };
    const identifier = groupIdentifier(latest);
    cleanupLog("Prepared CGS organization PDS cleanup account", { identifier, ...cleanupAccountDetails(account) });
    const password = await establishPassword(account, "Group", async (patch) => {
      cleanupLog("Patching CGS organization cleanup metadata", { patchKeys: Object.keys(patch), hasPassword: Boolean(patch.password), hasPasswordResetToken: Boolean(patch.passwordResetToken) });
      await patchCgsOrgMetadata({ accountPassword: patch.password ?? latest.accountPassword, passwordResetToken: patch.passwordResetToken ?? latest.passwordResetToken, cleanupError: null });
    });
    const session = await createSessionWithIdentifier(account, identifier, password);
    const inboxMessages = await listDisposableEmailMessages(account.inbox);
    const ignoredMessageIds = new Set(inboxMessages.map((message) => message.id));
    cleanupLog("Captured pre-delete inbox baseline for CGS organization", { groupDid: latest.groupDid, ignoredMessageCount: ignoredMessageIds.size, subjects: inboxMessages.map((message) => message.subject || message.id).slice(-10) });
    await requestAccountDelete(account, session);
    cleanupLog("Waiting for CGS organization account deletion token", { groupDid: latest.groupDid, inboxEmail: account.inbox.email });
    const deletionToken = await waitForInboxDeletionToken(account.inbox, ignoredMessageIds);
    cleanupLog("Received CGS organization account deletion token", { groupDid: latest.groupDid, tokenLength: deletionToken.length });
    await patchCgsOrgMetadata({ deletionToken, cleanupError: null });
    cleanupLog("Persisted CGS organization deletion token for manual recovery", { groupDid: latest.groupDid, metadataPath: cgsOrgMetadataPath, tokenLength: deletionToken.length });
    await deleteAccount(account, session, password, deletionToken);
    await patchCgsOrgMetadata({ accountPassword: password, deletedAt: now(), cleanupError: null });
    cleanupLog("Recorded CGS organization account deletedAt timestamp", { groupDid: latest.groupDid, metadataPath: cgsOrgMetadataPath });
    await verifyAccountGone(account, identifier, password, "CGS organization");
    await patchCgsOrgMetadata({ verifiedGoneAt: now(), cleanupError: null });
    cleanupLog("Recorded CGS organization verifiedGoneAt timestamp", { groupDid: latest.groupDid, metadataPath: cgsOrgMetadataPath });
    console.log(`[e2e] Deleted CGS organization PDS account ${latest.groupDid}.`);
  } catch (error) {
    const message = errorMessage(error);
    cleanupLog("Mandatory CGS organization cleanup failed; persisted cleanupError for manual recovery", { groupDid: org.groupDid, error: message, metadataPath: cgsOrgMetadataPath });
    await patchCgsOrgMetadata({ cleanupError: message });
    throw new Error(`Mandatory CGS organization cleanup failed: ${message}`);
  }
}

async function deleteDisposableAccountFromPath(metadataPath: string, authState: string, label: string): Promise<void> {
  cleanupLog("Loading disposable account cleanup metadata", { label, metadataPath, authState });
  const metadata = readDisposableAccountMetadataAt(metadataPath);
  if (!metadata) {
    cleanupLog("No disposable account metadata found; nothing to delete", { label, metadataPath });
    console.log(`[e2e] No ${label} disposable account metadata found; nothing to delete.`);
    return;
  }

  cleanupLog("Disposable account cleanup metadata loaded", {
    label,
    metadataPath,
    did: metadata.did,
    handle: metadata.handle,
    email: metadata.email,
    inboxProvider: metadata.inbox.provider,
    serviceEndpoint: metadata.serviceEndpoint,
    hasPassword: Boolean(metadata.password),
    deletedAt: metadata.deletedAt,
    verifiedGoneAt: metadata.verifiedGoneAt,
    cleanupError: metadata.cleanupError,
  });

  if (!metadata.did) {
    cleanupLog("Disposable account never completed sign-in; clearing only browser state", { label, metadataPath, email: metadata.email, authState });
    console.log(`[e2e] ${label} disposable account ${metadata.email} never completed sign-in; keeping metadata and clearing browser state.`);
    await rm(authState, { force: true });
    cleanupLog("Browser state cleared for incomplete disposable account", { label, authState });
    return;
  }

  try {
    const account: CleanupAccount = {
      did: metadata.did,
      handle: metadata.handle,
      email: metadata.email,
      inbox: metadata.inbox,
      serviceEndpoint: disposableServiceEndpoint(metadata),
      password: metadata.password,
    };
    cleanupLog("Prepared disposable PDS cleanup account", { label, ...cleanupAccountDetails(account) });
    const password = await establishPassword(account, label, async (patch) => {
      cleanupLog("Writing disposable cleanup metadata patch", { label, metadataPath, patchKeys: Object.keys(patch), hasPassword: Boolean(patch.password), hasPasswordResetToken: Boolean(patch.passwordResetToken) });
      await writeDisposableAccountMetadataAt(metadataPath, { ...metadata, password: patch.password ?? metadata.password, passwordResetToken: patch.passwordResetToken ?? metadata.passwordResetToken, cleanupError: null });
      Object.assign(metadata, patch, { cleanupError: null });
    });
    const inboxMessages = await listDisposableEmailMessages(account.inbox);
    const ignoredMessageIds = new Set(inboxMessages.map((message) => message.id));
    cleanupLog("Captured pre-delete inbox baseline for disposable account", { label, did: metadata.did, ignoredMessageCount: ignoredMessageIds.size, subjects: inboxMessages.map((message) => message.subject || message.id).slice(-10) });
    const session = await createSessionWithIdentifier(account, metadata.email, password);
    await requestAccountDelete(account, session);
    cleanupLog("Waiting for disposable account deletion token", { label, did: metadata.did, inboxEmail: account.inbox.email });
    const deletionToken = await waitForInboxDeletionToken(account.inbox, ignoredMessageIds);
    cleanupLog("Received disposable account deletion token", { label, did: metadata.did, tokenLength: deletionToken.length });
    await writeDisposableAccountMetadataAt(metadataPath, { ...metadata, password, deletionToken, cleanupError: null });
    cleanupLog("Persisted disposable account deletion token for manual recovery", { label, did: metadata.did, metadataPath, tokenLength: deletionToken.length });
    await deleteAccount(account, session, password, deletionToken);
    cleanupLog("Starting disposable account gone verification", { label, did: metadata.did });
    await verifyAccountGone(account, metadata.email, password, label);
    await writeDisposableAccountMetadataAt(metadataPath, { ...metadata, password, deletionToken, deletedAt: now(), verifiedGoneAt: now(), cleanupError: null });
    cleanupLog("Recorded disposable account deletedAt and verifiedGoneAt timestamps", { label, did: metadata.did, metadataPath });
    await rm(authState, { force: true });
    cleanupLog("Browser state cleared after disposable account deletion", { label, did: metadata.did, authState });
    console.log(`[e2e] Deleted ${label} disposable account ${metadata.did} (${metadata.email}).`);
  } catch (error) {
    const message = errorMessage(error);
    cleanupLog("Mandatory disposable account cleanup failed; persisted cleanupError for manual recovery", { label, did: metadata.did, error: message, metadataPath });
    await writeDisposableAccountMetadataAt(metadataPath, { ...metadata, cleanupError: message });
    throw new Error(`Mandatory ${label} disposable account cleanup failed: ${message}`);
  }
}

async function globalTeardown(): Promise<void> {
  cleanupLog("Global teardown cleanup starting", { cleanupSmokeReportPath });
  cleanupLog("Starting tracked PDS record cleanup pre-pass");
  const result = await cleanupCreatedPdsRecords();
  cleanupLog("Tracked PDS record cleanup pre-pass completed", result);
  console.log(
    `[e2e] Deleted ${result.deleted} test Cert record(s)${result.skipped ? `; disposable records are handled by account deletion (${result.skipped} tracked)` : ""}${result.failed ? `; ${result.failed} failed` : ""}.`,
  );

  const errors: string[] = [];
  const cleanupTasks = [
    { label: "CGS organization", run: () => deleteCgsOrganizationAccount() },
    { label: "member disposable account", run: () => deleteDisposableAccountFromPath(memberDisposableAccountMetadataPath, memberAuthStatePath, "member") },
    { label: "owner disposable account", run: () => deleteDisposableAccountFromPath(disposableAccountMetadataPath, authStatePath, "owner") },
  ];

  for (const task of cleanupTasks) {
    const taskStartedAt = Date.now();
    cleanupLog("Mandatory cleanup task starting", { label: task.label });
    try {
      await task.run();
      cleanupLog("Mandatory cleanup task completed", { label: task.label, elapsedMs: Date.now() - taskStartedAt });
    } catch (error) {
      const message = errorMessage(error);
      cleanupLog("Mandatory cleanup task failed", { label: task.label, elapsedMs: Date.now() - taskStartedAt, error: message });
      console.log(`[e2e] ${message}`);
      errors.push(message);
    }
  }

  const report = {
    createdAt: now(),
    ok: errors.length === 0,
    errors,
    cgsOrganization: readCgsOrgMetadata(),
    owner: readDisposableAccountMetadataAt(disposableAccountMetadataPath),
    member: readDisposableAccountMetadataAt(memberDisposableAccountMetadataPath),
  };
  cleanupLog("Writing cleanup smoke report", { cleanupSmokeReportPath, ok: report.ok, errorCount: errors.length });
  await mkdir("reports/e2e", { recursive: true });
  await writeFile(cleanupSmokeReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  cleanupLog("Cleanup smoke report written", { cleanupSmokeReportPath, ok: report.ok, errorCount: errors.length });
  console.log(`[e2e] Cleanup smoke report written to ${cleanupSmokeReportPath}.`);

  if (errors.length > 0) {
    cleanupLog("Global teardown cleanup failed", { errors });
    throw new Error(`Mandatory E2E cleanup failed:\n- ${errors.join("\n- ")}`);
  }

  cleanupLog("Global teardown cleanup completed successfully", { elapsedMs: Date.now() - cleanupStartedAt });
}

export default globalTeardown;
