import { redirect } from "next/navigation";
import { canonicalCertAliasHref, type RouteSearchParams } from "../../cert/route-compat";

export default async function LegacyBumicertIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ did }, search] = await Promise.all([params, searchParams]);
  redirect(canonicalCertAliasHref(`/cert/${encodeURIComponent(did)}`, search));
}
