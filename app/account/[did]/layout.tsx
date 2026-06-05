import type { Metadata } from "next";
import Container from "@/components/ui/container";
import { AccountHero } from "../_components/AccountHero";
import { AccountTabBar } from "../_components/AccountTabBar";
import { fetchAuthSession } from "../../_lib/auth-server";
import { getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export async function generateMetadata({ params }: { params: Promise<{ did: string }> }): Promise<Metadata> {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  return {
    title: `${account.displayName} — Account`,
    description: account.description ?? `Public GainForest data commons account for ${account.displayName}.`,
    alternates: { canonical: `/account/${encodeURIComponent(account.urlIdentifier)}` },
  };
}

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ did: string }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const [account, session] = await Promise.all([
    getAccountRouteData(did, urlIdentifier),
    fetchAuthSession(),
  ]);
  const isOwner = session.isLoggedIn && session.did === did;

  return (
    <main className="w-full">
      <Container className="pt-4 pb-8">
        <AccountHero
          account={account}
          isOwner={isOwner}
        />
        <AccountTabBar did={account.urlIdentifier} accountKind={account.kind} isOwner={isOwner} />
        {children}
      </Container>
    </main>
  );
}
