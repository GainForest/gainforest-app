import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { AuthCompleteClient } from "./_components/AuthCompleteClient";

export const metadata: Metadata = {
  title: "Completing sign in — GainForest",
  description: "Choose how you want to continue in GainForest.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

function normalizeRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/manage";

  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    const url = new URL(decoded);
    return `${url.pathname}${url.search}${url.hash}` || "/manage";
  } catch {
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/manage";
  }
}

export default async function AuthCompletePage({ searchParams }: PageProps) {
  const [{ redirect }] = await Promise.all([searchParams]);
  const session = await fetchAuthSession();
  const destination = normalizeRedirect(redirect);

  if (!session.isLoggedIn) {
    return <AuthCompleteClient session={null} account={null} redirectTo={destination} />;
  }

  const account = await getAccountRouteData(session.did, session.did).catch(() => null);

  return (
    <AuthCompleteClient
      session={{ did: session.did, handle: session.handle }}
      account={account ? {
        did: account.did,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        kind: account.kind,
      } : null}
      redirectTo={destination}
    />
  );
}
