import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getAccountRouteData, readAccountRouteParams } from "../../account/_lib/account-route";
import { GlobePageSkeleton } from "../../_components/PageLoadingSkeletons";
import { GlobeExplorer } from "../_components/GlobeExplorer";

export const revalidate = 300;

type GlobeOrgParams = Promise<{ identifier: string }>;

// readAccountRouteParams expects a `did` param name; adapt this route's
// `identifier` segment to it (both accept a handle or a DID).
function asAccountParams(params: GlobeOrgParams): Promise<{ did: string }> {
  return params.then(({ identifier }) => ({ did: identifier }));
}

export async function generateMetadata({ params }: { params: GlobeOrgParams }): Promise<Metadata> {
  const [{ did, urlIdentifier }, t] = await Promise.all([
    readAccountRouteParams(asAccountParams(params)),
    getTranslations("marketplace.globe.metadata"),
  ]);
  const account = await getAccountRouteData(did, urlIdentifier).catch(() => null);
  const name = account?.displayName ?? urlIdentifier;
  return {
    title: t("orgTitle", { name }),
    description: t("orgDescription", { name }),
    alternates: { canonical: `/globe/${encodeURIComponent(urlIdentifier)}` },
  };
}

export default async function OrganizationGlobePage({ params }: { params: GlobeOrgParams }) {
  const { did, urlIdentifier } = await readAccountRouteParams(asAccountParams(params));
  const account = await getAccountRouteData(did, urlIdentifier).catch(() => null);

  return (
    <Suspense fallback={<GlobePageSkeleton />}>
      <GlobeExplorer
        orgDid={did}
        orgName={account?.displayName ?? null}
        orgIdentifier={account?.urlIdentifier ?? urlIdentifier}
      />
    </Suspense>
  );
}
