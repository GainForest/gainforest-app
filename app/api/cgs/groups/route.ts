import { headers } from "next/headers";
import { getCertifiedProfileCard } from "@/app/account/_lib/account-route";
import { fetchIndexedCertifiedProfileCards, type IndexedCertifiedProfileCard } from "@/app/_lib/indexer";
import { getAuthBaseUrl, getAuthForwardCookie } from "@/app/_lib/auth";
import { LANGUAGE_COOKIE_NAME, isSupportedLanguageCode } from "@/lib/i18n/languages";
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing";

export const runtime = "nodejs";

type RawCgsGroup = Record<string, unknown> & { groupDid?: unknown };

type RawCgsGroupsPayload = Record<string, unknown> & { groups?: unknown };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name || rawValueParts.length === 0) continue;
    try {
      return decodeURIComponent(rawValueParts.join("="));
    } catch {
      return rawValueParts.join("=");
    }
  }
  return null;
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
  const rawCookie = headerList.get("cookie");
  const cookie = getAuthForwardCookie(rawCookie);
  const headerLocale = headerList.get(LOCALE_REQUEST_HEADER_NAME)?.trim();
  const cookieLocale = readCookieValue(rawCookie, LANGUAGE_COOKIE_NAME)?.trim();
  const locale = headerLocale && isSupportedLanguageCode(headerLocale)
    ? headerLocale
    : cookieLocale && isSupportedLanguageCode(cookieLocale)
      ? cookieLocale
      : null;
  const acceptLanguage = headerList.get("accept-language");
  const sourceUrl = new URL(request.url);
  const upstreamUrl = new URL("/api/cgs/groups", getAuthBaseUrl());
  upstreamUrl.search = sourceUrl.search;

  const upstreamHeaders: Record<string, string> = {
    ...(cookie ? { cookie } : {}),
    ...(locale ? { "x-gainforest-locale": locale } : {}),
    ...(acceptLanguage ? { "accept-language": acceptLanguage } : {}),
  };

  const upstream = await fetch(upstreamUrl, {
    headers: Object.keys(upstreamHeaders).length ? upstreamHeaders : undefined,
    cache: "no-store",
  });
  const body = await upstream.text();
  const contentType = upstream.headers.get("content-type") ?? "application/json";
  const responseBody = upstream.ok && contentType.includes("application/json")
    ? await hydrateGroupsBody(body).catch(() => body)
    : body;

  const response = new Response(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });

  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : [];
  const fallbackSetCookie = upstream.headers.get("set-cookie");
  for (const cookieValue of setCookies.length > 0 ? setCookies : fallbackSetCookie ? [fallbackSetCookie] : []) {
    response.headers.append("set-cookie", cookieValue);
  }

  return response;
}
