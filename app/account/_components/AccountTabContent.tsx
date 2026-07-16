import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BadgeCheckIcon, ChevronRightIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AccountGalleryClient } from "./AccountGalleryClient";
import type { GalleryProjectOption } from "./AccountGalleryUploader";
import { canCreateRecord } from "../../(manage)/manage/_lib/cgs-permissions";
import { RichText } from "../../_components/RichText";
import { InlineCardGridSkeleton } from "../../_components/PageLoadingSkeletons";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountProjectsGrid } from "./AccountProjectsGrid";
import { EndorsementsGivenGrid } from "./EndorsementsGivenGrid";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { OverviewFolders, type OverviewFolderTile } from "./OverviewFolders";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { ShareProfileButton } from "./ShareProfileButton";
import { DonationHistory } from "./DonationHistory";
import { fetchReceipts } from "../../_lib/dashboard";
import { fetchPublicDataCouncilMembers, type PublicDataCouncilMember } from "../../_lib/data-council";
import { fetchEndorsementsGiven } from "../../_lib/endorsements-given";
import type { AuthSession } from "../../_lib/auth";
import { fetchAuthSession } from "../../_lib/auth-server";
import { fetchUserCgsGroups, resolveAccountManageAccess } from "../../_lib/manage-server";
import { BumicertsSection, ObservationsSection, ProjectsSection } from "../../(manage)/manage/_sections";
import { monogram } from "../../_lib/did-profile";
import { attachProjectTitlesToGalleries, fetchAccountMaEarthRounds, fetchBumicertsByDid, fetchIndexedCertifiedProfileCards, fetchObservationSummaryByDid, fetchProjectImageGalleriesByDid, fetchProjectsByDid, fetchTimelineAttachmentsByDid, type TimelineAttachmentItem } from "../../_lib/indexer";
import { getEntriesForActivities } from "@/app/cert/[did]/[rkey]/_components/timeline/attachmentSubjects";
import { resolveTimelineReferences } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferenceResolver";
import { ProjectTimelineReadonly } from "@/app/projects/[did]/[rkey]/_components/ProjectTimelineReadonly";
import type { AccountRouteData } from "../_lib/account-route";
import { accountDonationsPath, accountObservationsPath, accountPath, accountProjectsPath } from "../_lib/account-route";

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

// Ma Earth verifies organizations round by round (per-round badge awards). We
// surface the *specific* rounds an account was part of — an explicit, per-round
// statement of record, rather than the generic "Trusted by Ma Earth" emblem.
async function AccountMaEarthRoundsSection({ did, className = "" }: { did: string; className?: string }) {
  const [t, rounds] = await Promise.all([
    getTranslations("common.maEarthRounds"),
    fetchAccountMaEarthRounds(did).catch(() => [] as number[]),
  ]);

  if (rounds.length === 0) return null;

  return (
    <section className={`rounded-3xl border border-border/60 bg-card p-5 org-animate org-fade-in-up org-delay-2 sm:p-6 ${className}`.trim()}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-background shadow-sm ring-1 ring-border/70">
          <Image
            src="/assets/media/images/badges/ma-earth-logo.webp"
            width={44}
            height={44}
            alt=""
            className="h-full w-full object-contain"
          />
        </span>
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {rounds.map((round) => (
          <li
            key={round}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3.5 py-2 text-sm font-medium text-foreground"
          >
            <BadgeCheckIcon className="size-4 shrink-0 text-primary" aria-hidden />
            {t("round", { round })}
          </li>
        ))}
      </ul>
    </section>
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

// Every project this organization runs publishes "updates" — the evidence
// reports, files, and field notes pinned to that project's timeline. Here we
// surface them all together on the org home tab: fetch the org's projects, gather
// the activity URIs their updates hang off (each project's collection URI plus
// the Cert it owns — updates attach to either), then filter the org's full
// attachment stream down to those and render the read-only timeline.
async function AccountProjectUpdatesSection({ did }: { did: string }) {
  const [referenceT, timelineT, timelineEntryT, projects, allEntries] = await Promise.all([
    getTranslations("bumicert.detail.reference"),
    getTranslations("bumicert.detail.timeline"),
    getTranslations("bumicert.detail.timelineEntry"),
    fetchProjectsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchTimelineAttachmentsByDid(did).catch(() => [] as TimelineAttachmentItem[]),
  ]);

  const matchUris = new Set<string>();
  for (const project of projects) {
    matchUris.add(project.atUri);
    for (const certUri of project.bumicertUris) matchUris.add(certUri);
  }

  const entries = getEntriesForActivities(allEntries, Array.from(matchUris));
  if (entries.length === 0) return null;

  const references = await resolveTimelineReferences({
    entries,
    copy: {
      linkedRecord: referenceT("linkedRecord"),
      linkedAudioRecord: referenceT("linkedAudioRecord"),
      audioEvidence: referenceT("audioEvidence"),
      linkedDataset: referenceT("linkedDataset"),
      linkedTreeRecord: referenceT("linkedTreeRecord"),
      linkedSiteRecord: referenceT("linkedSiteRecord"),
      siteEvidence: referenceT("siteEvidence"),
      linkedNatureData: timelineT("fallbacks.linkedNatureData"),
      treeCount: (count: number) => timelineEntryT("treeCount", { count }),
      speciesCount: (count: number) => timelineEntryT("speciesCount", { count }),
      observationCount: (count: number) => timelineEntryT("observationCount", { count }),
      individualCount: (count: number) => referenceT("individualCount", { count }),
    },
  }).catch(() => []);

  return (
    <section className="mt-8 org-animate org-fade-in-up org-delay-2">
      <ProjectTimelineReadonly
        organizationDid={did}
        entries={entries}
        references={references}
        summaryScope="organization"
        previewMode
      />
    </section>
  );
}

// Shared loader for an account's photo galleries — used both by the standalone
// Files & photos tab (personal profiles) and the org Overview's inline gallery.
async function loadAccountGalleryData(account: AccountRouteData, did: string) {
  const [rawGalleries, projectsResult, access] = await Promise.all([
    fetchProjectImageGalleriesByDid(did).catch(() => []),
    fetchProjectsByDid(did, 1000)
      .then((page) => ({ loaded: true, records: page.records }))
      .catch(() => ({ loaded: false, records: [] as Awaited<ReturnType<typeof fetchProjectsByDid>>["records"] })),
    resolveAccountManageAccess(account.urlIdentifier).catch(() => null),
  ]);
  const projects = projectsResult.records;
  const galleries = attachProjectTitlesToGalleries(rawGalleries, projects);

  // A manager target lets the client offer uploads (create) and orphan cleanup
  // (delete); it checks each permission before showing the matching controls.
  const target = access?.status === "allowed" ? access.target : null;

  // Galleries still pinned to a project that no longer exists are orphaned: the
  // project was deleted but its photos stayed behind. We only flag them once the
  // project list has actually loaded, so a failed fetch never hides live ones.
  const projectUris = new Set(projects.map((project) => project.atUri));
  const orphanedGalleries = projectsResult.loaded
    ? galleries.filter((gallery) => gallery.projectUri !== null && !projectUris.has(gallery.projectUri))
    : [];
  const orphanedIds = new Set(orphanedGalleries.map((gallery) => gallery.id));
  const liveGalleries = galleries.filter((gallery) => !orphanedIds.has(gallery.id));

  const projectOptions: GalleryProjectOption[] = projects
    .filter((project) => Boolean(project.cid))
    .map((project) => ({ uri: project.atUri, cid: project.cid, title: project.title }));

  return { liveGalleries, orphanedGalleries, projectOptions, target };
}

// Organizations no longer get a standalone Files & photos tab; instead the photo
// gallery lives inline on the Overview, right under the About blurb. We only
// render it when there are photos to show or the viewer can add some, so an
// empty org landing page stays clean.
async function AccountOverviewGallerySection({ account, did }: { account: AccountRouteData; did: string }) {
  const [tabsT, gallery] = await Promise.all([
    getTranslations("common.accountTabs"),
    loadAccountGalleryData(account, did),
  ]);

  const canUpload = gallery.target ? canCreateRecord(gallery.target).allowed : false;
  if (gallery.liveGalleries.length === 0 && !canUpload) return null;

  return (
    <section className="mt-8 org-animate org-fade-in-up org-delay-2">
      <h2 className="font-instrument text-2xl italic leading-none text-foreground">{tabsT("gallery")}</h2>
      <div className="mt-4">
        <AccountGalleryClient
          initialGalleries={gallery.liveGalleries}
          orphanedGalleries={gallery.orphanedGalleries}
          projects={gallery.projectOptions}
          target={gallery.target}
          accountName={account.displayName}
        />
      </div>
    </section>
  );
}

export async function AccountHomeTabContent({ account }: { account: AccountRouteData }) {
  const organizationAbout = account.kind === "organization" ? account.longDescription?.trim() ?? "" : "";
  const hasAbout = account.kind === "organization"
    ? organizationAbout.length > 0
    : Boolean(account.detail?.richBody?.length || account.detail?.blurb);
  const aboutT = await getTranslations("common.accountAbout");

  return (
    <>
      {hasAbout ? (
        <section className="mt-8 org-animate org-fade-in-up org-delay-1">
          <h2 className="font-instrument text-2xl italic leading-none text-foreground">{aboutT("title")}</h2>
          {account.kind === "organization" ? (
            <p className="mt-4 max-w-3xl whitespace-pre-line text-base leading-7 text-foreground/85 md:text-lg md:leading-8">
              {organizationAbout}
            </p>
          ) : account.detail?.richBody?.length ? (
            <div className="mt-4">
              <RichText blocks={account.detail.richBody} />
            </div>
          ) : (
            <p className="mt-4 max-w-3xl text-base leading-7 text-foreground/85 md:text-lg md:leading-8">
              {account.detail?.blurb}
            </p>
          )}
        </section>
      ) : null}
      {account.kind === "organization" ? <AccountOverviewGallerySection account={account} did={account.did} /> : null}
      {account.kind === "organization" ? <AccountMaEarthRoundsSection did={account.did} className="mt-8" /> : null}
      {account.kind === "organization" ? <AccountProjectUpdatesSection did={account.did} /> : null}
      {account.kind === "organization" ? <AccountDataCouncilSection did={account.did} /> : null}
    </>
  );
}

// Compact, full-width profile landing for personal accounts: a short bio, a row
// of at-a-glance stat tiles that link into each tab, and a slim share card.
// Replaces the bulky right-hand sidebar that used to crowd the Certs page.
export async function AccountOverviewTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const [tabsT, shareT, locale, projects, receipts, observationSummary] = await Promise.all([
    getTranslations("common.accountTabs"),
    getTranslations("marketplace.account.sidebar"),
    getLocale(),
    fetchProjectsByDid(did, 1000).then((page) => page.records).catch(() => []),
    fetchReceipts().catch(() => []),
    fetchObservationSummaryByDid(did).catch(() => null),
  ]);
  const donationCount = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did).length;
  const hasAbout = Boolean(account.detail?.richBody?.length || account.detail?.blurb);

  const folderTiles: OverviewFolderTile[] = [
    { id: "projects", title: tabsT("projects"), href: accountProjectsPath(account.urlIdentifier), count: projects.length },
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

      <AccountMaEarthRoundsSection did={did} />

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
  // Stewards edit their Certs right here on the profile tab (same surface the
  // old /manage URL used); everyone else sees the read-only public grid.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  if (access?.status === "allowed") {
    return <BumicertsSection target={access.target} />;
  }

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

  // Anonymous donations are recorded with the wallet only — never the
  // profile — so they can't be listed here. Tell the owner that, otherwise
  // a donor who checked "Donate anonymously" thinks their donation is lost.
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false }) as AuthSession);
  const viewerIsOwner = session.isLoggedIn && session.did === did;

  return (
    <section className="py-6">
      <DonationHistory receipts={userDonations} showAnonymousNote={viewerIsOwner} />
    </section>
  );
}

// Stewards manage their projects/observations right here on the public profile
// tab — the same surface as the old /manage URL — so they never need to leave
// for a separate manage page. Anyone without manage access sees the read-only
// public view instead.
export async function AccountObservationsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  if (access?.status === "allowed") {
    return <ObservationsSection target={access.target} />;
  }

  return (
    <Suspense fallback={<InlineCardGridSkeleton />}>
      <RecordExplorer kind="occurrence" ownerDid={did} showHero={false} hideOccurrenceFilters defaultOccurrenceMedia="all" />
    </Suspense>
  );
}

export async function AccountProjectsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  if (access?.status === "allowed") {
    return <ProjectsSection target={access.target} />;
  }

  const projects = await fetchProjectsByDid(did, 1000, null, undefined, undefined, { withScopeTags: true })
    .then((page) => page.records)
    .catch(() => []);
  return <AccountProjectsGrid projects={projects} />;
}

// Organizations this org has publicly endorsed (its signed "Organization
// Endorsement" badge awards). Only surfaced as a tab when there's at least one,
// so the grid is normally non-empty; the empty copy is a direct-navigation
// fallback.
export async function AccountEndorsementsGivenTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  if (account.kind !== "organization") {
    notFound();
  }

  const [t, organizations] = await Promise.all([
    getTranslations("common.accountEndorsementsGiven"),
    fetchEndorsementsGiven(did).catch(() => []),
  ]);

  return (
    <section className="py-6 org-animate org-fade-in-up org-delay-1">
      <div className="mb-5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
          {organizations.length > 0 ? <span className="text-sm text-muted-foreground">{organizations.length}</span> : null}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("description", { name: account.displayName })}
        </p>
      </div>
      <EndorsementsGivenGrid organizations={organizations} />
    </section>
  );
}

// The organizations a person belongs to live in the group service, which only
// lets us read the signed-in viewer's own memberships. So memberships are
// private: they resolve only when you're viewing your own profile. The result
// is surfaced as a "Member of…" row in the profile hero (no separate tab).
export async function loadAccountMemberships(
  account: AccountRouteData,
  session: AuthSession,
): Promise<AccountOrganization[]> {
  if (account.kind !== "user" || !session.isLoggedIn || session.did !== account.did) {
    return [];
  }

  const t = await getTranslations("common.accountOrganizations");
  const groups = await fetchUserCgsGroups();
  const dids = [...new Set(groups.map((group) => group.groupDid).filter((did): did is string => Boolean(did)))];
  const cards = dids.length
    ? await fetchIndexedCertifiedProfileCards(dids).catch(() => new Map())
    : new Map();

  return groups
    .filter((group) => Boolean(group.groupDid))
    .map((group) => {
      const card = cards.get(group.groupDid);
      const role = group.role === "owner" || group.role === "admin" ? group.role : "member";
      return {
        did: group.groupDid,
        identifier: group.handle?.trim() || group.groupDid,
        displayName: group.displayName?.trim() || card?.displayName || group.handle?.trim() || t("fallbackName"),
        avatarUrl: group.avatarUrl ?? card?.avatarUrl ?? null,
        role,
      } satisfies AccountOrganization;
    });
}

export async function AccountGalleryTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const { liveGalleries, orphanedGalleries, projectOptions, target } = await loadAccountGalleryData(account, did);

  return (
    <AccountGalleryClient
      initialGalleries={liveGalleries}
      orphanedGalleries={orphanedGalleries}
      projects={projectOptions}
      target={target}
      accountName={account.displayName}
    />
  );
}
