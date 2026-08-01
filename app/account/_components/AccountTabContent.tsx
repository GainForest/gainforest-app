import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AccountGalleryClient } from "./AccountGalleryClient";
import type { GalleryProjectOption } from "./AccountGalleryUploader";
import { InlineCardGridSkeleton } from "../../_components/PageLoadingSkeletons";
import { RecordExplorer } from "../../_components/RecordExplorer";
import { AccountAboutSection } from "./AccountAboutSection";
import { AccountActivityFeed } from "./AccountActivityFeed";
import { AccountBumicertsGrid } from "./AccountBumicertsGrid";
import { AccountOverviewSidebar } from "./AccountOverviewSidebar";
import { AccountProjectsSection } from "./AccountProjectsSection";
import { AccountProjectsGrid } from "./AccountProjectsGrid";
import { EndorsementsGivenGrid } from "./EndorsementsGivenGrid";
import type { AccountOrganization } from "./AccountOrganizationsGrid";
import { AccountContentColumns, AccountSidebar } from "./AccountSidebar";
import { DonationHistory } from "./DonationHistory";
import { fetchReceipts } from "../../_lib/dashboard";
import { fetchOwnAnonymousReceipts } from "../../_lib/anonymous-donations";
import { fetchEndorsementsGiven } from "../../_lib/endorsements-given";
import type { AuthSession } from "../../_lib/auth";
import { fetchAuthSession } from "../../_lib/auth-server";
import { fetchUserCgsGroups, resolveAccountManageAccess } from "../../_lib/manage-server";
import { BumicertsSection, ObservationsSection, ProjectsSection } from "../../(manage)/manage/_sections";
import { attachProjectTitlesToGalleries, fetchBumicertsByDid, fetchIndexedCertifiedProfileCards, fetchObservationSummaryByDid, fetchProjectImageGalleriesByDid, fetchProjectsByDid, fetchTimelineAttachmentsByDid, type TimelineAttachmentItem } from "../../_lib/indexer";
import { getEntriesForActivities } from "@/app/cert/[did]/[rkey]/_components/timeline/attachmentSubjects";
import { resolveTimelineReferences } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferenceResolver";
import { ProjectTimelineReadonly } from "@/app/projects/[did]/[rkey]/_components/ProjectTimelineReadonly";
import { getAccountProjects, type AccountRouteData } from "../_lib/account-route";

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

/**
 * An account's landing view, in the order a visitor asks the questions:
 *
 *   1. Who is this?      — About, leading the page.
 *   2. What do they run?  — their projects.
 *   3. What have they been doing? — the stream of records they've published.
 *
 * The side rail carries the supporting details (support, counts, photos,
 * recognition) rather than the story. Personal and organization profiles share
 * the same shape — blocks that don't apply simply hide themselves.
 */
export async function AccountOverviewContent({ account, did }: { account: AccountRouteData; did: string }) {
  const [session, projects, receipts, observationSummary] = await Promise.all([
    fetchAuthSession().catch(() => ({ isLoggedIn: false }) as AuthSession),
    getAccountProjects(did),
    fetchReceipts().catch(() => []),
    fetchObservationSummaryByDid(did).catch(() => null),
  ]);
  const memberships = await loadAccountMemberships(account, session);

  const received = receipts.filter((receipt) => receipt.orgDid === did);
  const receivedUsd = received.reduce((total, receipt) => total + (receipt.amount || 0), 0);
  const supporters = new Set(received.map((receipt) => receipt.from?.id).filter(Boolean)).size;
  const donationCount = receipts.filter((receipt) => receipt.from?.type === "did" && receipt.from.id === did).length;

  const activityT = await getTranslations("common.accountOverview");

  return (
    // Explicit grid placement so the rail can sit beside the story on wide
    // screens while, on a phone, it slots between the projects and the record
    // stream — the stream keeps loading as you scroll, so nothing useful may
    // sit below it.
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-10 org-animate org-fade-in-up lg:col-start-1 lg:row-start-1">
        <AccountAboutSection account={account} />
        <AccountProjectsSection account={account} projects={projects} />
      </div>

      <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <AccountOverviewSidebar
          account={account}
          counts={{
            projects: projects.length,
            observations: observationSummary?.count ?? account.summary.observationCount ?? 0,
            donations: account.kind === "user" ? donationCount : null,
          }}
          receivedUsd={receivedUsd}
          supporters={supporters}
          memberships={memberships}
        />
      </aside>

      <section className="min-w-0 lg:col-start-1 lg:row-start-2">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{activityT("recentActivity")}</h2>
        <div className="mt-4">
          <AccountActivityFeed did={did} />
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

  // Anonymous donations carry no public profile link — but the owner can
  // still see their own, matched server-side via their donor hash. This
  // merge must ONLY happen for the owner's session.
  const session = await fetchAuthSession().catch(() => ({ isLoggedIn: false }) as AuthSession);
  const viewerIsOwner = session.isLoggedIn && session.did === did;
  const anonymousDonations = viewerIsOwner ? await fetchOwnAnonymousReceipts(did).catch(() => []) : [];

  const merged = [...userDonations, ...anonymousDonations].sort((a, b) => {
    const dateA = Date.parse(a.occurredAt ?? a.createdAt ?? "") || 0;
    const dateB = Date.parse(b.occurredAt ?? b.createdAt ?? "") || 0;
    return dateB - dateA;
  });

  return (
    <section className="py-6">
      <DonationHistory receipts={merged} showAnonymousNote={viewerIsOwner} />
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
  // Updates published across all of an organization's projects read as one
  // timeline; it sits under the project list, where those projects live.
  const updates = account.kind === "organization" ? <AccountProjectUpdatesSection did={did} /> : null;

  if (access?.status === "allowed") {
    return (
      <>
        <ProjectsSection target={access.target} />
        {updates}
      </>
    );
  }

  const projects = await fetchProjectsByDid(did, 1000, null, undefined, undefined, { withScopeTags: true })
    .then((page) => page.records)
    .catch(() => []);
  return (
    <>
      <AccountProjectsGrid projects={projects} />
      {updates}
    </>
  );
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
