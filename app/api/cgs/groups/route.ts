import { headers } from "next/headers";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { fetchIndexedCertifiedProfileCards, type IndexedCertifiedProfileCard } from "@/app/_lib/indexer";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";

export const runtime = "nodejs";

type RawCgsGroup = Record<string, unknown> & { groupDid?: unknown };

type RawCgsGroupsPayload = Record<string, unknown> & { groups?: unknown };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function hydrateGroup(group: RawCgsGroup, indexed?: IndexedCertifiedProfileCard): Promise<RawCgsGroup> {
  const groupDid = nonEmptyString(group.groupDid);
  if (!groupDid?.startsWith("did:")) return group;

  const card = await getCertifiedProfileCard(groupDid).catch(() => null);

  return {
    ...group,
    displayName: nonEmptyString(group.displayName) ?? indexed?.displayName ?? card?.displayName ?? null,
    description: nonEmptyString(group.description) ?? card?.description ?? null,
    avatarUrl: nonEmptyString(group.avatarUrl) ?? indexed?.avatarUrl ?? card?.avatarUrl ?? null,
    handle: nonEmptyString(group.handle) ?? card?.handle ?? null,
  };
}

async function hydrateGroupsBody(body: string): Promise<string> {
  const payload = JSON.parse(body) as RawCgsGroupsPayload;
  if (!Array.isArray(payload.groups)) return body;

  const rawGroups = payload.groups.filter((group): group is RawCgsGroup => typeof group === "object" && group !== null);
  const groupDids = rawGroups
    .map((group) => nonEmptyString(group.groupDid))
    .filter((did): did is string => Boolean(did?.startsWith("did:")));
  const indexedByDid = await fetchIndexedCertifiedProfileCards([...new Set(groupDids)]).catch(
    () => new Map<string, IndexedCertifiedProfileCard>(),
  );

  const groups = await Promise.all(
    payload.groups.map((group) =>
      typeof group === "object" && group !== null
        ? hydrateGroup(group as RawCgsGroup, indexedByDid.get(nonEmptyString((group as RawCgsGroup).groupDid) ?? ""))
        : group,
    ),
  );

  return JSON.stringify({ ...payload, groups });
}

export async function GET(request: Request) {
  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));
  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL("/api/cgs/groups", getAuthBaseUrl());
  upstreamUrl.search = sourceUrl.search;

  const upstream = await fetch(upstreamUrl, {
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  });
  const body = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const responseBody = upstream.ok && contentType.includes("application/json")
    ? await hydrateGroupsBody(body).catch(() => body)
    : body;

  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}
