import { notFound, redirect } from "next/navigation";
import { localBumicertHref } from "../../_lib/urls";
import { getAccountRouteData } from "../../account/_lib/account-route";

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

export default async function LegacyBumicertPage({ params }: { params: Promise<{ did: string }> }) {
  const { did } = await params;
  const parsed = parseLegacyBumicertId(did);
  if (!parsed) notFound();
  const account = await getAccountRouteData(parsed.did, parsed.did).catch(() => null);
  redirect(localBumicertHref(account?.urlIdentifier ?? parsed.did, parsed.rkey));
}
