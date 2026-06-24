import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ProjectGalleryViewer } from "../../_components/ProjectGalleryViewer";
import { RichText } from "../../_components/RichText";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { AccountSettingsSections } from "./AccountSettingsSections";
import { DonationHistory } from "./DonationHistory";
import { fetchReceipts } from "../../_lib/dashboard";
import { fetchPublicDataCouncilMembers, type PublicDataCouncilMember } from "../../_lib/data-council";
import { monogram } from "../../_lib/did-profile";
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

function DataCouncilAvatar({ member }: { member: PublicDataCouncilMember }) {
  const mono = monogram(member.displayName?.trim() || "Member", member.did);
  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white">
      {member.avatarUrl ? (
        <Image src={member.avatarUrl} alt="" fill className="object-cover" unoptimized />
      ) : (
        <span aria-hidden style={{ backgroundColor: mono.bg }} className="flex size-full items-center justify-center">
          {mono.char}
        </span>
      )}
    </div>
  );
}

async function AccountDataCouncilSection({ did }: { did: string }) {
  const [t, members] = await Promise.all([
    getTranslations("common.accountDataCouncil"),
    fetchPublicDataCouncilMembers(did).catch(() => []),
  ]);

  return (
    <section className="mt-8 rounded-3xl border border-border/60 bg-card p-5 org-animate org-fade-in-up org-delay-2 sm:p-6">
      <div className="flex items-baseline gap-2">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
        {members.length > 0 ? <span className="text-sm text-muted-foreground">{members.length}</span> : null}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
      {members.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <div key={member.did} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-3 py-3">
              <DataCouncilAvatar member={member} />
              <p className="min-w-0 truncate text-sm font-medium text-foreground">
                {member.displayName?.trim() || t("memberFallback")}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">{t("empty")}</p>
      )}
    </section>
  );
}

export async function AccountHomeTabContent({ account }: { account: AccountRouteData }) {
  const organizationAbout = account.kind === "organization" ? account.longDescription?.trim() ?? "" : "";
  const hasAbout = account.kind === "organization"
    ? organizationAbout.length > 0
    : Boolean(account.detail?.richBody?.length || account.detail?.blurb);

  return (
    <>
      {hasAbout ? (
        <section className="py-1 md:py-2 org-animate org-fade-in-up org-delay-1">
          {account.kind === "organization" ? (
            <p className="mt-5 max-w-3xl whitespace-pre-line text-lg leading-8 text-foreground/85 md:text-xl md:leading-9">
              {organizationAbout}
            </p>
          ) : account.detail?.richBody?.length ? (
            <RichText blocks={account.detail.richBody} />
          ) : (
            <p className="mt-5 max-w-3xl text-lg leading-8 text-foreground/85 md:text-xl md:leading-9">
              {account.detail?.blurb}
            </p>
          )}
        </section>
      ) : null}
      {account.kind === "organization" ? <AccountDataCouncilSection did={account.did} /> : null}
    </>
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
