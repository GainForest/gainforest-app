import { redirect } from "next/navigation";
import { canonicalCertAliasHref, type RouteSearchParams } from "../../../cert/route-compat";

export default async function LegacyBumicertDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string; rkey: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const [{ did, rkey }, search] = await Promise.all([params, searchParams]);
  redirect(canonicalCertAliasHref(`/cert/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`, search));
}
