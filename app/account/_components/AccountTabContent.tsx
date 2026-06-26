import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ProjectGalleryViewer } from "../../_components/ProjectGalleryViewer";
import { RichText } from "../../_components/RichText";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountProjectsGrid } from "./AccountProjectsGrid";
import { OverviewFolders, type OverviewFolderTile } from "./OverviewFolders";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { AccountSettingsSections } from "./AccountSettingsSections";
import { ShareProfileButton } from "./ShareProfileButton";
import { DonationHistory } from "./DonationHistory";
import { fetchReceipts } from "../../_lib/dashboard";
import { fetchPublicDataCouncilMembers, type PublicDataCouncilMember } from "../../_lib/data-council";
import { monogram } from "../../_lib/did-profile";
import { attachProjectTitlesToGalleries, fetchBumicertsByDid, fetchObservationSummaryByDid, fetchProjectImageGalleriesByDid, fetchProjectsByDid } from "../../_lib/indexer";
import type { AccountRouteData } from "../_lib/account-route";
import { accountBumicertsPath, accountDonationsPath, accountGalleryPath, accountObservationsPath, accountPath, accountProjectsPath } from "../_lib/account-route";

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

async function AccountOverviewFolders({ account }: { account: AccountRouteData }) {
  const [tabsT, projects, galleries] = await Promise.all([
    getTranslations("common.accountTabs"),
    fetchProjectsByDid(account.did, 1000).then((page) => page.records).catch(() => []),
    fetchProjectImageGalleriesByDid(account.did).catch(() => []),
  ]);

  const tiles: OverviewFolderTile[] = [
    { id: "projects", title: tabsT("projects"), href: accountProjectsPath(account.urlIdentifier), count: projects.length },
    { id: "certs", title: tabsT("bumicerts"), href: accountBumicertsPath(account.urlIdentifier), count: account.summary.bumicertCount },
    { id: "observations", title: tabsT("observations"), href: accountObservationsPath(account.urlIdentifier), count: account.summary.observationCount },
    { id: "gallery", title: tabsT("gallery"), href: accountGalleryPath(account.urlIdentifier), count: galleries.length },
  ];

  return (
    <section className="org-animate org-fade-in-up org-delay-1">
      <OverviewFolders tiles={tiles} />
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
      {account.kind === "organization" ? <AccountOverviewFolders account={account} /> : null}
      {hasAbout ? (
        <section className="py-1 md:py-2 org-animate org-fade-in-up org-delay-1">
          {account.kind === "organization" ? (
            <p className="mt-5 max-w-3xl whitespace-pre-line text-base leading-7 text-foreground/85 md:text-lg md:leading-8">
              {organizationAbout}
            </p>
          ) : account.detail?.richBody?.length ? (
            <RichText blocks={account.detail.richBody} />
          ) : (
            <p className="mt-5 max-w-3xl text-base leading-7 text-foreground/85 md:text-lg md:leading-8">
              {account.detail?.blurb}
            </p>
          )}
        </section>
      ) : null}
      {account.kind === "organization" ? <AccountDataCouncilSection did={account.did} /> : null}
    </>
  );
}

// Compact, full-width profile landing for personal accounts: a short bio, a row
// of at-a-glance stat tiles that link into each tab, and a slim share card.
// Replaces the bulky right-hand sidebar that used to crowd the Certs page.
export async function AccountOverviewTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const [tabsT, shareT, locale, bumicerts, projects, receipts, observationSummary] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("marketplace.account.sidebar"),
    getLocale(),
    fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchProjectsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchReceipts().catch(() => []),
    fetchObservationSummaryByDid(did).catch(() => null),
  ]);
  const donationCount = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did).length;
  const hasAbout = Boolean(account.detail?.richBody?.length || account.detail?.blurb);

  const folderTiles: OverviewFolderTile[] = [
    { id: "projects", title: tabsT("projects"), href: accountProjectsPath(account.urlIdentifier), count: projects.length },
    { id: "certs", title: tabsT("bumicerts"), href: accountBumicertsPath(account.urlIdentifier), count: bumicerts.length },
    { id: "observations", title: tabsT("observations"), href: accountObservationsPath(account.urlIdentifier), count: observationSummary?.count ?? 0 },
    { id: "donations", title: tabsT("donations"), href: accountDonationsPath(account.urlIdentifier), count: donationCount },
  ];

  return (
    <div className="space-y-5 py-2">
      {hasAbout ? (
        <section className="org-animate org-fade-in-up org-delay-1">
          {account.detail?.richBody?.length ? (
            <RichText blocks={account.detail.richBody} />
          ) : (
            <p className="max-w-3xl text-base leading-7 text-foreground/85 md:text-lg md:leading-8">{account.detail?.blurb}</p>
          )}
        </section>
      ) : null}

      <section className="org-animate org-fade-in-up org-delay-1">
        <OverviewFolders tiles={folderTiles} />
      </section>

      <section className="rounded-2xl border border-border bg-card/80 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{shareT("shareProfileTitle")}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{shareT("shareProfileBody")}</p>
        </div>
        <div className="mt-3 shrink-0 sm:mt-0">
          <ShareProfileButton
            profilePath={`/${locale}${accountPath(account.urlIdentifier)}`}
            label={shareT("copyProfileLink")}
            copiedLabel={shareT("profileLinkCopied")}
          />
        </div>
      </section>
    </div>
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
  const bumicerts = await fetchBumicertsByDid(did, 1000).then((page) => page.records).catch(() => []);
  const grid = (
    <>
      <ManageActionRow action={manageAction} />
      <AccountBumicertsGrid bumicerts={bumicerts} organizationIdentifier={account.urlIdentifier} organizationName={account.displayName} logoUrl={account.avatarUrl} />
    </>
  );

  // Personal profiles render the Certs grid full-width; the at-a-glance stats
  // now live on the Overview tab instead of a crowding sidebar.
  if (account.kind !== "organization") {
    return <div className="py-2">{grid}</div>;
  }

  const receipts = await fetchReceipts().catch(() => []);
  const donationCount = receipts.filter((receipt) => receipt.orgDid === did).length;

  return (
    <AccountContentColumns
      sidebar={<AccountSidebar account={account} bumicertCount={bumicerts.length} donationCount={donationCount} />}
    >
      {grid}
    </AccountContentColumns>
  );
}

export async function AccountDonationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "user") {
    notFound();
  }

  const receipts = await fetchReceipts().catch(() => []);
  const userDonations = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did);

  return (
    <section className="py-6">
      <DonationHistory receipts={userDonations} />
    </section>
  );
}

export function AccountObservationsTabContent({ did }: { account: AccountRouteData; did: string }) {
  return (
    <Suspense fallback={null}>
      <RecordExplorer kind="occurrence" ownerDid={did} showHero={false} />
    </Suspense>
  );
}

export async function AccountProjectsTabContent({ did }: { account: AccountRouteData; did: string }) {
  const projects = await fetchProjectsByDid(did, 1000).then((page) => page.records).catch(() => []);
  return <AccountProjectsGrid projects={projects} />;
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
