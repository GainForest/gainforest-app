import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const cgsOrgMetadataPath = "e2e/.auth/cgs-organization.json";

export type CgsOrgMetadata = {
  source: "cgs-organization";
  createdAt: string;
  groupDid: string;
  handle: string | null;
  accountPassword: string | null;
  displayName: string;
  ownerDid: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function groupIdentifier(metadata: CgsOrgMetadata): string {
  return metadata.handle?.trim() || metadata.groupDid;
}

export function groupManageBasePath(metadata: CgsOrgMetadata): string {
  return `/manage/groups/${encodeURIComponent(groupIdentifier(metadata))}`;
}

export async function writeCgsOrgMetadata(metadata: CgsOrgMetadata): Promise<void> {
  await mkdir(dirname(cgsOrgMetadataPath), { recursive: true });
  await writeFile(cgsOrgMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

export async function clearCgsOrgMetadata(): Promise<void> {
  await rm(cgsOrgMetadataPath, { force: true });
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
  };
}
