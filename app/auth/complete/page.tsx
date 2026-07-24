import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { AuthCompleteClient } from "./_components/AuthCompleteClient";
import { normalizeAuthRedirect } from "./redirects";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.authComplete.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

type PageProps = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

export default async function AuthCompletePage({ searchParams }: PageProps) {
  const [{ redirect }] = await Promise.all([searchParams]);
  const session = await fetchAuthSession();
  const destination = normalizeAuthRedirect(redirect);

  if (!session.isLoggedIn) {
    return <AuthCompleteClient session={null} account={null} redirectTo={destination} />;
  }

  const account = await getAccountRouteData(session.did, session.did).catch(() => null);
  // Default post-login destination is the activity feed (the app's logged-in
  // home base), not the legacy /manage shim.
  const finalDestination = destination === "/manage" ? "/feed" : destination;

  return (
    <AuthCompleteClient
      session={{ did: session.did, handle: session.handle }}
      account={account ? {
        did: account.did,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        kind: account.kind,
      } : null}
      redirectTo={finalDestination}
    />
  );
}
