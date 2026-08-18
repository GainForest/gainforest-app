import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DisposableInbox } from "./disposable-email";

export const cgsOrgMetadataPath = "e2e/.auth/cgs-organization.json";

export type CgsOrgMetadata = {
  source: "cgs-organization";
  createdAt: string;
  groupDid: string;
  handle: string | null;
  accountPassword: string | null;
  displayName: string;
  ownerDid: string;
  serviceEndpoint?: string | null;
  recoveryEmail?: string | null;
  recoveryInbox?: DisposableInbox | null;
  passwordResetToken?: string | null;
  deletionToken?: string | null;
  destroyedAt?: string | null;
  deletedAt?: string | null;
  verifiedGoneAt?: string | null;
  cleanupError?: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInbox(value: unknown): DisposableInbox | null {
  if (!isObject(value) || typeof value.email !== "string") return null;
  if (value.provider === "mailtm" && typeof value.password === "string" && typeof value.token === "string") {
    return { provider: "mailtm", email: value.email, password: value.password, token: value.token };
  }
  if (value.provider === "guerrillamail" && typeof value.sidToken === "string" && typeof value.cookie === "string") {
    return { provider: "guerrillamail", email: value.email, sidToken: value.sidToken, cookie: value.cookie };
  }
  return null;
}

export function groupIdentifier(metadata: CgsOrgMetadata): string {
  return metadata.handle?.trim() || metadata.groupDid;
}

export function groupManageBasePath(metadata: CgsOrgMetadata): string {
  return `/account/${encodeURIComponent(groupIdentifier(metadata))}/manage`;
}

export async function writeCgsOrgMetadata(metadata: CgsOrgMetadata): Promise<void> {
  await mkdir(dirname(cgsOrgMetadataPath), { recursive: true });
  await writeFile(cgsOrgMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

export async function patchCgsOrgMetadata(patch: Partial<CgsOrgMetadata>): Promise<CgsOrgMetadata | null> {
  const current = readCgsOrgMetadata();
  if (!current) return null;
  const next = { ...current, ...patch };
  await writeCgsOrgMetadata(next);
  return next;
}

export function readCgsOrgMetadata(): CgsOrgMetadata | null {
  const path = resolve(process.cwd(), cgsOrgMetadataPath);
  if (!existsSync(path)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }

  if (!isObject(parsed) || parsed.source !== "cgs-organization") return null;
  if (typeof parsed.groupDid !== "string" || !parsed.groupDid.startsWith("did:")) return null;
  if (typeof parsed.displayName !== "string" || typeof parsed.ownerDid !== "string") return null;

  return {
    source: "cgs-organization",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    groupDid: parsed.groupDid,
    handle: typeof parsed.handle === "string" ? parsed.handle : null,
    accountPassword: typeof parsed.accountPassword === "string" ? parsed.accountPassword : null,
    displayName: parsed.displayName,
    ownerDid: parsed.ownerDid,
    serviceEndpoint: typeof parsed.serviceEndpoint === "string" ? parsed.serviceEndpoint : null,
    recoveryEmail: typeof parsed.recoveryEmail === "string" ? parsed.recoveryEmail : null,
    recoveryInbox: parseInbox(parsed.recoveryInbox),
    passwordResetToken: typeof parsed.passwordResetToken === "string" ? parsed.passwordResetToken : null,
    deletionToken: typeof parsed.deletionToken === "string" ? parsed.deletionToken : null,
    destroyedAt: typeof parsed.destroyedAt === "string" ? parsed.destroyedAt : null,
    deletedAt: typeof parsed.deletedAt === "string" ? parsed.deletedAt : null,
    verifiedGoneAt: typeof parsed.verifiedGoneAt === "string" ? parsed.verifiedGoneAt : null,
    cleanupError: typeof parsed.cleanupError === "string" ? parsed.cleanupError : null,
  };
}
