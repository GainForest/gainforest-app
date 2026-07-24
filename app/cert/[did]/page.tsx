import { notFound, redirect } from "next/navigation";
import { localBumicertHref } from "../../_lib/urls";
import { getAccountRouteData } from "../../account/_lib/account-route";
import { canonicalCertAliasHref, type RouteSearchParams } from "../route-compat";

export const revalidate = 60;

function parseLegacyBumicertId(value: string): { did: string; rkey: string } | null {
  const decoded = safeDecode(value);
  const separatorIndex = decoded.indexOf("-");
  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return null;

  return {
    did: decoded.slice(0, separatorIndex),
    rkey: decoded.slice(separatorIndex + 1),
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function LegacyBumicertPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ did }, search] = await Promise.all([params, searchParams]);
  const parsed = parseLegacyBumicertId(did);
  if (!parsed) notFound();
  const account = await getAccountRouteData(parsed.did, parsed.did).catch(() => null);
  redirect(canonicalCertAliasHref(localBumicertHref(account?.urlIdentifier ?? parsed.did, parsed.rkey), search));
}
