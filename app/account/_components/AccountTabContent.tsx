import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { ProjectGalleryViewer } from "../../_components/ProjectGalleryViewer";
import { RichText } from "../../_components/RichText";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { AccountSettingsSections } from "./AccountSettingsSections";
import { DonationHistory } from "./DonationHistory";
import { fetchReceipts } from "../../_lib/dashboard";
import { attachProjectTitlesToGalleries, fetchBumicertsByDid, fetchProjectImageGalleriesByDid, fetchProjectsByDid } from "../../_lib/indexer";
import type { AccountRouteData } from "../_lib/account-route";

type ManageAction = {
  href: string;
  label: string;
  description: string;
};

function ManageActionRow({ action }: { action?: ManageAction | null }) {
  if (!action) return null;

  return (
    <Link
      href={action.href}
      className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/50 px-4 py-3 text-sm transition-colors hover:bg-muted"
    >
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{action.label}</span>
        <span className="mt-0.5 block text-muted-foreground">{action.description}</span>
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function AccountHomeTabContent({ account }: { account: AccountRouteData }) {
  if (!account.detail?.richBody?.length && !account.detail?.blurb) return null;

  return (
    <section className="py-1 md:py-2 org-animate org-fade-in-up org-delay-1">
      {account.detail?.richBody?.length ? (
        <RichText blocks={account.detail.richBody} />
      ) : (
        <p className="mt-5 max-w-3xl text-[14px] leading-[1.62] text-foreground/80">
          {account.detail?.blurb}
        </p>
      )}
    </section>
  );
}

export async function AccountBumicertsTabContent({
  account,
  did,
  manageAction,
}: {
  account: AccountRouteData;
  did: string;
  manageAction?: ManageAction | null;
}) {
  const [bumicerts, receipts] = await Promise.all([
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchReceipts().catch(() => []),
  ]);
  const donationCount = receipts.filter((receipt) =>
    account.kind === "organization"
      ? receipt.orgDid === did
      : receipt.from?.type === "did" && receipt.from.id === did,
  ).length;

  return (
    <AccountContentColumns
      sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={donationCount} />}
    >
      <ManageActionRow action={manageAction} />
      <AccountBumicertsGrid bumicerts={bumicerts} organizationIdentifier={account.urlIdentifier} organizationName={account.displayName} logoUrl={account.avatarUrl} />
    </AccountContentColumns>
  );
}

export async function AccountDonationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "user") {
    notFound();
  }

  const [receipts, bumicerts] = await Promise.all([
    fetchReceipts().catch(() => []),
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
  ]);
  const userDonations = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did);

  return (
    <AccountContentColumns sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={userDonations.length} />}>
      <section className="py-6">
        <DonationHistory receipts={userDonations} />
      </section>
    </AccountContentColumns>
  );
}

export function AccountObservationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "organization") {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <RecordExplorer kind="occurrence" ownerDid={did} showHero={false} />
    </Suspense>
  );
}

export async function AccountGalleryTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "organization") {
    notFound();
  }

  const [rawGalleries, projects] = await Promise.all([
    fetchProjectImageGalleriesByDid(did).catch(() => []),
    fetchProjectsByDid(did, 1000).then((page) => page.records).catch(() => []),
  ]);
  const galleries = attachProjectTitlesToGalleries(rawGalleries, projects);

  return <ProjectGalleryViewer galleries={galleries} variant="account" />;
}

export function AccountSettingsTabContent({ account }: { account: AccountRouteData }) {
  return <AccountSettingsSections did={account.did} />;
}
