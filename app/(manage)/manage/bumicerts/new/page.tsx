import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { NewBumicertClient, type LinkedProjectPrefill } from "./_components/NewBumicertClient";

export const metadata: Metadata = {
  title: "New Bumicert — Manage",
  description: "Create a new Bumicert.",
  robots: { index: false, follow: false },
};

type NewBumicertSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PdsRecordResponse = {
  uri?: string;
  cid?: string;
  value?: Record<string, unknown>;
};

export default async function NewBumicertPage({ searchParams }: { searchParams: NewBumicertSearchParams }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const [account, resolvedSearchParams] = await Promise.all([
    getAccountRouteData(session.did, session.did),
    searchParams,
  ]);
  const linkedProject = await fetchLinkedProjectPrefill(session.did, projectParam(resolvedSearchParams.forProject));

  return (
    <NewBumicertClient
      did={session.did}
      ownerIdentifier={account.urlIdentifier}
      profile={{ name: account.displayName, avatarUrl: account.avatarUrl }}
      linkedProject={linkedProject}
    />
  );
}

function projectParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function parseProjectParam(value: string | null): { did: string; rkey: string } | null {
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  const separatorIndex = decoded.lastIndexOf("/");
  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return null;
  return {
    did: decoded.slice(0, separatorIndex),
    rkey: decoded.slice(separatorIndex + 1),
  };
}

async function fetchLinkedProjectPrefill(sessionDid: string, rawParam: string | null): Promise<LinkedProjectPrefill | null> {
  const parsed = parseProjectParam(rawParam);
  if (!parsed || parsed.rkey.includes("/")) return null;

  const host = await resolvePdsHost(parsed.did);
  if (!host) return null;
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: "org.hypercerts.collection",
    rkey: parsed.rkey,
  });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as PdsRecordResponse | null;
  if (!payload?.uri || !payload.value) return null;
  const record = payload.value;
  if (stringValue(record.type)?.toLowerCase() !== "project") return null;
  const image = await projectImage(parsed.did, record);

  return {
    did: parsed.did,
    rkey: parsed.rkey,
    atUri: payload.uri,
    cid: typeof payload.cid === "string" ? payload.cid : null,
    title: stringValue(record.title) ?? "Untitled project",
    shortDescription: stringValue(record.shortDescription),
    description: descriptionText(record.description),
    imageUrl: image,
    locationUri: locationUri(record.location),
    rawRecord: record,
    canLink: parsed.did === sessionDid,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function descriptionText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return null;
  const simpleValue = stringValue(value.value);
  if (simpleValue) return simpleValue;
  if (!Array.isArray(value.blocks)) return null;
  const text = value.blocks
    .map((entry) => {
      const block = isRecord(entry) && isRecord(entry.block) ? entry.block : null;
      return block ? stringValue(block.plaintext) : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n\n")
    .trim();
  return text || null;
}

function locationUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return stringValue(value.uri);
}

function extractBlobRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  if (typeof value.$link === "string") return value.$link;
  if (typeof value.ref === "string") return value.ref;
  if (isRecord(value.ref) && typeof value.ref.$link === "string") return value.ref.$link;
  return null;
}

async function imageUrlFromDef(did: string, value: unknown): Promise<string | null> {
  if (!isRecord(value)) return null;
  const uri = stringValue(value.uri);
  if (uri) return uri;
  const ref = extractBlobRef(value.image) ?? extractBlobRef(value.blob) ?? extractBlobRef(value.ref);
  return ref ? await resolveBlobUrl(did, ref, undefined).catch(() => null) : null;
}

async function projectImage(did: string, record: Record<string, unknown>): Promise<string | null> {
  return (await imageUrlFromDef(did, record.banner)) ?? (await imageUrlFromDef(did, record.avatar));
}
