import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeftIcon,
  BanIcon,
  BotIcon,
  ChevronRightIcon,
  CircleDotIcon,
  ClipboardCheckIcon,
  CrownIcon,
  ExternalLinkIcon,
  GiftIcon,
  HeartIcon,
  LeafIcon,
  MapPinnedIcon,
  PaperclipIcon,
  PencilIcon,
  SparklesIcon,
  SproutIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react";
import { BumicertsBumicertCard } from "@/components/bumicert/BumicertsBumicertCard";
import { AuthorInline } from "../../../_components/AuthorChip";
import { PreferredAccountLink } from "../../../_components/PreferredLinks";
import { ProjectGalleryViewer } from "../../../_components/ProjectGalleryViewer";
import { RichText } from "../../../_components/RichText";
import { RecordEngagement } from "../../../_components/RecordEngagement";
import { SocialGlyph } from "../../../_components/SocialIcon";
import { StatsTileGrid, type StatsTileItem } from "../../../_components/StatsTile";
import { fetchReceipts, type DonorRef, type FundingReceipt } from "../../../_lib/dashboard";
import { formatCompact, formatCompactUsd, formatCountry, formatDate, formatDateTime, formatNumber, formatRelative } from "../../../_lib/format";
import { formatWorkScopeTag, type WorkScopeLabels } from "../../../_lib/work-scope-labels";
import { fetchReviewCounts, fetchReviewsForSubject, type BumicertReviews, type ReviewComment, type ReviewCounts } from "../../../_lib/reviews";
import {
  attachProjectTitlesToGalleries,
  fetchBumicertsByDid,
  fetchImageOccurrencesByDid,
  fetchObservationSummaryByDid,
  fetchProjectImageGalleriesByDid,
  fetchProjectsByDid,
  fetchRecordByUri,
  fetchRecordDetail,
  fetchTimelineAttachmentsByDid,
  type BumicertRecord,
  type DetailBadge,
  type ObservationSummary,
  type OccurrenceRecord,
  type ProjectImageGallery,
  type TimelineAttachmentItem,
} from "../../../_lib/indexer";
import { isPdsBlobUrl } from "../../../_lib/pds";
import { blockExplorerUrl, INDEXER_URL, localBumicertHref, localProjectHref } from "../../../_lib/urls";
import { getRequestOrigin } from "../../../_lib/request-origin";
import { fetchAuthSession } from "../../../_lib/auth-server";
import type { AuthSession } from "../../../_lib/auth";
import { fetchUserCgsGroups } from "../../../_lib/manage-server";
import { getAccountRouteData, readAccountRouteParams, type AccountKind } from "../../../account/_lib/account-route";
import { Separator } from "@/components/ui/separator";
import { BumicertHeaderTitleBridge } from "./_components/BumicertHeaderTitleBridge";
import { BumicertShareButton } from "./_components/BumicertShareButton";
import { BumicertObservationsGallery } from "./_components/BumicertObservationsGallery";
import { BumicertDeleteAction } from "./_components/BumicertDeleteAction";
import { DonateButton } from "./_components/donate/DonateButton";
import { FundingStatus } from "./_components/donate/FundingStatus";
import { BumicertTimeline } from "./_components/timeline/BumicertTimeline";
import { getEntriesForActivities } from "./_components/timeline/attachmentSubjects";
import { resolveTimelineReferences } from "./_components/timeline/timelineReferenceResolver";
import type { TimelineReference } from "./_components/timeline/timelineReferences";
import { canCreateRecord, canDeleteRecord, canUpdateRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";

export const revalidate = 60;

type BumicertPageParams = Promise<{ did: string; rkey: string }>;
type BumicertSearchParams = Promise<{ tab?: string | string[] }>;

type FundingConfigStatus = "open" | "coming-soon" | "paused" | "closed" | null;

type BumicertFundingConfig = {
  receivingWallet: { uri: string } | null;
  status: FundingConfigStatus;
  goalInUSD: string | null;
  minDonationInUSD: string | null;
  maxDonationInUSD: string | null;
  allowOversell: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
} | null;

type RouteData = {
  record: BumicertRecord;
  detail: Awaited<ReturnType<typeof fetchRecordDetail>>;
  owner: Awaited<ReturnType<typeof getAccountRouteData>>;
  fundingConfig: BumicertFundingConfig;
  authSession: Awaited<ReturnType<typeof fetchAuthSession>>;
  routeIdentifier: string;
  urlIdentifier: string;
};

type TimelinePermission = { allowed: boolean; reason: string | null };
type TimelineAccess = {
  canManageEvidence: boolean;
  createPermission: TimelinePermission;
  deletePermission: TimelinePermission;
  mutationRepo?: string;
};
type TimelinePermissionCopy = {
  signIn: string;
  notMember: string;
  createDenied: string;
  deleteDenied: string;
};

const TIMELINE_DENIED: TimelineAccess = {
  canManageEvidence: false,
  createPermission: { allowed: false, reason: null },
  deletePermission: { allowed: false, reason: null },
};

async function resolveTimelineAccess(recordDid: string, ownerKind: AccountKind, authSession: AuthSession, copy: TimelinePermissionCopy): Promise<TimelineAccess> {
  if (!authSession.isLoggedIn) {
    return {
      ...TIMELINE_DENIED,
      createPermission: { allowed: false, reason: copy.signIn },
      deletePermission: { allowed: false, reason: copy.signIn },
    };
  }

  if (authSession.did === recordDid) {
    return {
      canManageEvidence: true,
      createPermission: { allowed: true, reason: null },
      deletePermission: { allowed: true, reason: null },
    };
  }

  if (ownerKind === "organization") {
    const groups = await fetchUserCgsGroups();
    const membership = groups.find((group) => group.groupDid === recordDid);
    if (!membership) {
      return {
        ...TIMELINE_DENIED,
        createPermission: { allowed: false, reason: copy.notMember },
        deletePermission: { allowed: false, reason: copy.notMember },
      };
    }

    const target = { kind: "group" as const, role: membership.role };
    const create = canCreateRecord(target);
    const remove = canDeleteRecord(target);
    return {
      canManageEvidence: true,
      createPermission: { allowed: create.allowed, reason: create.allowed ? null : copy.createDenied },
      deletePermission: { allowed: remove.allowed, reason: remove.allowed ? null : copy.deleteDenied },
      mutationRepo: recordDid,
    };
  }

  const ownsPersonalRecord = authSession.did === recordDid;
  return {
    canManageEvidence: ownsPersonalRecord,
    createPermission: { allowed: ownsPersonalRecord, reason: ownsPersonalRecord ? null : copy.signIn },
    deletePermission: { allowed: ownsPersonalRecord, reason: ownsPersonalRecord ? null : copy.signIn },
  };
}

type CertManageAccess = {
  canDelete: boolean;
  canManageDonations: boolean;
  /** Org DID for group-owned writes; undefined for personal repos. */
  mutationRepo?: string;
};

/**
 * Whether the signed-in viewer may manage this Cert. Personal owners always can;
 * for organization-owned Certs we check CGS membership/role.
 */
async function resolveCertManageAccess(recordDid: string, ownerKind: AccountKind, authSession: AuthSession): Promise<CertManageAccess> {
  if (!authSession.isLoggedIn) return { canDelete: false, canManageDonations: false };
  if (authSession.did === recordDid) return { canDelete: true, canManageDonations: true };
  if (ownerKind === "organization") {
    const groups = await fetchUserCgsGroups();
    const membership = groups.find((group) => group.groupDid === recordDid);
    if (!membership) return { canDelete: false, canManageDonations: false };
    const target = { kind: "group" as const, role: membership.role };
    const remove = canDeleteRecord(target);
    const updateFunding = canUpdateRecord(target);
    return { canDelete: remove.allowed, canManageDonations: updateFunding.allowed, mutationRepo: recordDid };
  }
  return { canDelete: false, canManageDonations: false };
}

const BADGE_TONE: Record<DetailBadge["tone"], string> = {
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  info: "bg-foreground/[0.06] text-foreground/70",
};

const BUMICERT_DETAIL_TABS = ["overview", "site-boundaries", "reviews", "donations", "timeline"] as const;
type BumicertDetailTab = (typeof BUMICERT_DETAIL_TABS)[number];

export async function generateMetadata({ params }: { params: BumicertPageParams }): Promise<Metadata> {
  const { record, owner, urlIdentifier } = await readRouteData(params);
  const description = record.shortDescription ?? `Cert published by ${owner.displayName}.`;
  return {
    title: `${record.title} — Cert`,
    description,
    alternates: { canonical: localBumicertHref(urlIdentifier, record.rkey) },
    openGraph: {
      title: record.title,
      description,
      type: "article",
      images: record.imageUrl ? [{ url: record.imageUrl }] : undefined,
    },
  };
}

export default async function BumicertDetailPage({
  params,
  searchParams,
}: {
  params: BumicertPageParams;
  searchParams: BumicertSearchParams;
}) {
  const [routeData, search, origin] = await Promise.all([
    readRouteData(params),
    searchParams,
    getRequestOrigin(),
  ]);
  const activeTab = parseDetailTab(search.tab);

  // A project owns exactly one Cert, and the project page is now the canonical,
  // fully-featured page. Redirect there when a parent project exists; legacy
  // standalone Certs (no parent collection) keep rendering here so old deep
  // links still resolve.
  const parentProject = await findProjectForCert(routeData.record.did, routeData.record.atUri);
  if (parentProject) {
    const projectHref = localProjectHref(routeData.urlIdentifier, parentProject.rkey);
    redirect(activeTab === "overview" ? projectHref : `${projectHref}?tab=${activeTab}`);
  }

  const detailHref = localBumicertHref(routeData.urlIdentifier, routeData.record.rkey);
  if (routeData.routeIdentifier !== routeData.urlIdentifier) {
    redirect(activeTab === "overview" ? detailHref : `${detailHref}?tab=${activeTab}`);
  }
  return <BumicertDetailBody routeData={routeData} activeTab={activeTab} basePath={detailHref} origin={origin} />;
}

/** Find the project (collection) in this repo whose items[] include the Cert. */
async function findProjectForCert(did: string, certUri: string) {
  const projects = await fetchProjectsByDid(did, 1000)
    .then((page) => page.records)
    .catch(() => []);
  return projects.find((project) => project.bumicertUris.includes(certUri)) ?? null;
}

/**
 * Shared rich detail body for a Cert. Rendered both at /cert/<did>/<rkey> and,
 * because a project owns exactly one Cert, inline on the project page — so the
 * project page carries every feature (story, evidence, site boundaries,
 * reviews, donations, timeline) instead of linking out to a separate page.
 *
 * `basePath` is the page URL the tabs and in-page links resolve against, so the
 * same body works under the Cert URL and the Project URL.
 */
export async function BumicertDetailBody({
  routeData,
  activeTab,
  basePath,
  origin,
  backHref,
  backLabel,
  showMore = true,
  timelineMatchUris,
}: {
  routeData: RouteData;
  activeTab: BumicertDetailTab;
  basePath: string;
  origin: string;
  backHref?: string;
  backLabel?: string;
  showMore?: boolean;
  /**
   * Activity URIs whose timeline evidence should appear. Defaults to the Cert
   * URI; the project page also passes the project (collection) URI so legacy
   * project-pinned evidence keeps showing after the Cert↔project merge.
   */
  timelineMatchUris?: string[];
}) {
  const { record, detail, owner, fundingConfig, authSession } = routeData;
  const matchUris = timelineMatchUris && timelineMatchUris.length > 0 ? timelineMatchUris : [record.atUri];
  const workScopeT = await getTranslations("common.workScopes");
  const workScopeLabels: WorkScopeLabels = {
    reforestation: workScopeT("reforestation"),
    forest_protection: workScopeT("forestProtection"),
    biodiversity_monitoring: workScopeT("natureMonitoring"),
    community_stewardship: workScopeT("communityStewardship"),
    carbon_removal: workScopeT("carbonRemoval"),
    restoration_maintenance: workScopeT("restorationMaintenance"),
  };
  const detailHref = basePath;
  const donationsHref = `${detailHref}?tab=donations`;
  const period = record.startDate || record.endDate
    ? `${record.startDate ? formatDate(record.startDate) : "—"} → ${record.endDate ? formatDate(record.endDate) : "—"}`
    : "Not specified";
  const description = detail?.blurb ?? record.shortDescription;
  const certManageAccess = await resolveCertManageAccess(record.did, owner.kind, authSession);
  const ownerProfileHref = `/account/${encodeURIComponent(owner.urlIdentifier)}`;

  let donationReceipts: FundingReceipt[] = [];
  let donationsUnavailable = false;
  if (activeTab === "overview" || activeTab === "donations") {
    try {
      donationReceipts = (await fetchReceipts()).filter((receipt) => receipt.bumicertUri === record.atUri);
    } catch (error) {
      console.warn("Unable to load Cert donations", record.atUri, error);
      donationsUnavailable = true;
    }
  }

  const isOverviewTab = activeTab === "overview";
  const showsDetailSidebar = activeTab !== "timeline";
  const [moreBumicerts, observations, observationSummary, linkedTimelineCount, reviewCounts, projectGalleries] = isOverviewTab
    ? await Promise.all([
        fetchBumicertsByDid(record.did, 6)
          .then((page) => page.records.filter((item) => item.id !== record.id).slice(0, 5))
          .catch(() => []),
        fetchImageOccurrencesByDid(record.did, 24).catch(() => []),
        fetchObservationSummaryByDid(record.did).catch(() => null),
        fetchTimelineAttachmentsByDid(record.did)
          .then((items) => getEntriesForActivities(items, matchUris).length)
          .catch(() => null),
        fetchReviewCounts(record.atUri).catch(() => null),
        fetchGalleriesForBumicertProject(record.did, record.atUri).catch(() => []),
      ])
    : [[], [] as OccurrenceRecord[], null, null, null, [] as ProjectImageGallery[]];

  const reviews = activeTab === "reviews"
    ? await fetchReviewsForSubject(record.atUri).catch(() => ({ evaluations: [], comments: [] }))
    : null;

  let timelineAttachments: TimelineAttachmentItem[] = [];
  let timelineReferences: TimelineReference[] = [];
  let timelineAttachmentsUnavailable = false;
  const emptyTimelineSources = { audio: [], occurrences: [], occurrencesIncomplete: false, treeGroups: [], places: [] };

  let timelineAccess = TIMELINE_DENIED;

  if (activeTab === "timeline") {
    const [attachmentsResult, permissionT, timelineT, timelineEntryT, referenceT] = await Promise.all([
      fetchTimelineAttachmentsByDid(record.did).then(
        (items) => ({ ok: true as const, items }),
        () => ({ ok: false as const, items: [] as TimelineAttachmentItem[] }),
      ),
      getTranslations("bumicert.detail.evidenceAdder.permissions"),
      getTranslations("bumicert.detail.timeline"),
      getTranslations("bumicert.detail.timelineEntry"),
      getTranslations("bumicert.detail.reference"),
    ]);
    timelineAttachments = attachmentsResult.items;
    timelineAttachmentsUnavailable = !attachmentsResult.ok;

    const timelineEntries = getEntriesForActivities(timelineAttachments, matchUris);
    const referencePromise = resolveTimelineReferences({
      entries: timelineEntries,
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

    timelineAccess = await resolveTimelineAccess(record.did, owner.kind, authSession, {
      signIn: permissionT("signIn"),
      notMember: permissionT("notMember"),
      createDenied: permissionT("createDenied"),
      deleteDenied: permissionT("deleteDenied"),
    });

    timelineReferences = await referencePromise;
  }

  const jsonLd = buildBumicertJsonLd(record, owner, fundingConfig, detailHref, description ?? null, origin);

  return (
    <>
      <script
        id="bumicert-json-ld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BumicertHeaderTitleBridge
        summary={{
          title: record.title,
          donateHref: donationsHref,
          card: {
            did: record.did,
            title: record.title,
            shortDescription: record.shortDescription,
            imageUrl: record.imageUrl,
            locationCount: record.locationCount,
            contributorCount: record.contributorCount,
            creatorName: record.creatorName,
            creatorAvatarRef: record.creatorAvatarRef,
            startDate: record.startDate,
            endDate: record.endDate,
          },
        }}
      />
      <main className="min-h-screen bg-background pb-20">
        {backHref ? (
          <div className="mx-auto max-w-6xl px-6 pt-6 lg:px-8">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
              {backLabel ?? "Back"}
            </Link>
          </div>
        ) : null}
        <section className={`mx-auto max-w-6xl gap-8 px-6 py-8 lg:px-8 ${showsDetailSidebar ? "grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]" : ""}`}>
          {showsDetailSidebar && (
            <aside className={`min-w-0 ${isOverviewTab ? "" : "hidden lg:block"}`}>
              <div className="lg:sticky lg:top-28">
                <OverviewSidebar
                  record={record}
                  detail={detail}
                  owner={owner}
                  receipts={donationReceipts}
                  donationsUnavailable={donationsUnavailable}
                  fundingConfig={fundingConfig}
                  authSession={authSession}
                  canDelete={certManageAccess.canDelete}
                  canManageDonations={certManageAccess.canManageDonations}
                  mutationRepo={certManageAccess.mutationRepo}
                  deleteRedirectHref={ownerProfileHref}
                />
              </div>
            </aside>
          )}

          <div className="min-w-0">
            {activeTab === "overview" && (
              <OverviewPanel
                record={record}
                detail={detail}
                description={description}
                observations={observations}
                projectGalleries={projectGalleries}
                evidence={{
                  boundaries: record.locationUris.length,
                  observationSummary,
                  timelineCount: linkedTimelineCount,
                  reviews: reviewCounts,
                  detailHref,
                  ownerHref: `/account/${encodeURIComponent(owner.urlIdentifier)}`,
                }}
                workScopeLabels={workScopeLabels}
              />
            )}
            {activeTab === "site-boundaries" && <SiteBoundariesPanel record={record} />}
            {activeTab === "reviews" && reviews && <ReviewsPanel record={record} reviews={reviews} />}
            {activeTab === "donations" && (
              <DonationsPanel
                record={record}
                owner={owner}
                fundingConfig={fundingConfig}
                authSession={authSession}
                receipts={donationReceipts}
                unavailable={donationsUnavailable}
                canManageDonations={certManageAccess.canManageDonations}
                mutationRepo={certManageAccess.mutationRepo}
              />
            )}
            {activeTab === "timeline" && (
              <BumicertTimeline
                organizationDid={record.did}
                activityUri={record.atUri}
                activityCid={record.cid ?? ""}
                matchActivityUris={matchUris}
                bumicertTitle={record.title}
                canManageEvidence={timelineAccess.canManageEvidence}
                createPermission={timelineAccess.createPermission}
                deletePermission={timelineAccess.deletePermission}
                mutationRepo={timelineAccess.mutationRepo}
                initialEntries={timelineAttachments}
                sources={emptyTimelineSources}
                references={timelineReferences}
                attachmentsUnavailable={timelineAttachmentsUnavailable}
              />
            )}
          </div>

          {showMore && isOverviewTab && moreBumicerts.length > 0 ? (
            <MoreBumicertsSection
              bumicerts={moreBumicerts}
              owner={owner}
            />
          ) : null}
        </section>
      </main>
    </>
  );
}

/**
 * Integrated, single-page detail layout for a project. Instead of hiding
 * places, updates, reviews, and support behind tabs, every section is rendered
 * inline with anchored section headers; the at-a-glance evidence chips double
 * as in-page navigation. Used by the project detail page; the tabbed
 * `BumicertDetailBody` is kept for legacy standalone Certs.
 */
export async function ProjectDetailView({
  routeData,
  basePath,
  origin,
  backHref,
  backLabel,
  editHref,
  editLabel,
  timelineMatchUris,
  projectRkey,
  engagementSubjectUri,
}: {
  routeData: RouteData;
  basePath: string;
  origin: string;
  backHref?: string;
  backLabel?: string;
  editHref?: string;
  editLabel?: string;
  timelineMatchUris?: string[];
  /** Project (collection) rkey, so deleting removes the project, not the Cert. */
  projectRkey?: string;
  /** When set, render the feed's like + comment bar for this record URI under
   *  the hero (the project page passes its collection URI so the count matches
   *  the activity feed). Omitted on standalone Cert pages. */
  engagementSubjectUri?: string;
}) {
  const { record, detail, owner, fundingConfig, authSession } = routeData;
  const matchUris = timelineMatchUris && timelineMatchUris.length > 0 ? timelineMatchUris : [record.atUri];

  const [workScopeT, permissionT, timelineT, timelineEntryT, referenceT] = await Promise.all([
    getTranslations("common.workScopes"),
    getTranslations("bumicert.detail.evidenceAdder.permissions"),
    getTranslations("bumicert.detail.timeline"),
    getTranslations("bumicert.detail.timelineEntry"),
    getTranslations("bumicert.detail.reference"),
  ]);
  const workScopeLabels: WorkScopeLabels = {
    reforestation: workScopeT("reforestation"),
    forest_protection: workScopeT("forestProtection"),
    biodiversity_monitoring: workScopeT("natureMonitoring"),
    community_stewardship: workScopeT("communityStewardship"),
    carbon_removal: workScopeT("carbonRemoval"),
    restoration_maintenance: workScopeT("restorationMaintenance"),
  };

  const detailHref = basePath;
  const description = detail?.blurb ?? record.shortDescription;
  const ownerProfileHref = `/account/${encodeURIComponent(owner.urlIdentifier)}`;

  const [certManageAccess, receiptsResult, observations, observationSummary, reviewCounts, projectGalleries, reviews, attachmentsResult, timelineAccess] = await Promise.all([
    resolveCertManageAccess(record.did, owner.kind, authSession),
    fetchReceipts().then(
      (all) => ({ ok: true as const, receipts: all.filter((receipt) => receipt.bumicertUri === record.atUri) }),
      () => ({ ok: false as const, receipts: [] as FundingReceipt[] }),
    ),
    fetchImageOccurrencesByDid(record.did, 24).catch(() => [] as OccurrenceRecord[]),
    fetchObservationSummaryByDid(record.did).catch(() => null),
    fetchReviewCounts(record.atUri).catch(() => null),
    fetchGalleriesForBumicertProject(record.did, record.atUri).catch(() => [] as ProjectImageGallery[]),
    fetchReviewsForSubject(record.atUri).catch(() => ({ evaluations: [], comments: [] })),
    fetchTimelineAttachmentsByDid(record.did).then(
      (items) => ({ ok: true as const, items }),
      () => ({ ok: false as const, items: [] as TimelineAttachmentItem[] }),
    ),
    resolveTimelineAccess(record.did, owner.kind, authSession, {
      signIn: permissionT("signIn"),
      notMember: permissionT("notMember"),
      createDenied: permissionT("createDenied"),
      deleteDenied: permissionT("deleteDenied"),
    }),
  ]);

  const donationReceipts = receiptsResult.receipts;
  const donationsUnavailable = !receiptsResult.ok;
  const timelineAttachments = attachmentsResult.items;
  const timelineAttachmentsUnavailable = !attachmentsResult.ok;
  const timelineEntries = getEntriesForActivities(timelineAttachments, matchUris);
  const timelineReferences = timelineEntries.length
    ? await resolveTimelineReferences({
        entries: timelineEntries,
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
      }).catch(() => [])
    : [];
  const emptyTimelineSources = { audio: [], occurrences: [], occurrencesIncomplete: false, treeGroups: [], places: [] };

  const canManageDonations = certManageAccess.canManageDonations;
  const hasObservations = observations.length > 0;
  const hasPlaces = record.locationUris.length > 0;
  // Stewards always see Updates so they can add evidence; visitors only when
  // there is something to show.
  const showUpdates = timelineEntries.length > 0 || timelineAccess.canManageEvidence;
  const showSupport = Boolean(fundingConfig?.receivingWallet?.uri) || donationReceipts.length > 0 || canManageDonations;
  const donationsHref = showSupport ? `${detailHref}#support` : detailHref;
  const reviewCount = (reviewCounts?.evaluations ?? 0) + (reviewCounts?.comments ?? 0);
  const period = record.startDate || record.endDate
    ? `${record.startDate ? formatDate(record.startDate) : "\u2014"} \u2192 ${record.endDate ? formatDate(record.endDate) : "\u2014"}`
    : null;
  const recentUpdates = [...timelineEntries]
    .sort((a, b) =>
      (b.record.createdAt ?? b.metadata.createdAt ?? "").localeCompare(a.record.createdAt ?? a.metadata.createdAt ?? ""),
    )
    .slice(0, 3);

  // Evidence chips double as in-page nav; point each at its section when that
  // section is rendered, otherwise fall back so zero-state chips aren't dead.
  const anchors = {
    boundaries: hasPlaces ? "#places" : detailHref,
    sightings: hasObservations ? "#observations" : ownerProfileHref,
    timeline: showUpdates ? "#updates" : detailHref,
    reviews: "#reviews",
  };

  const jsonLd = buildBumicertJsonLd(record, owner, fundingConfig, detailHref, description ?? null, origin);

  return (
    <>
      <script
        id="bumicert-json-ld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BumicertHeaderTitleBridge
        summary={{
          title: record.title,
          donateHref: donationsHref,
          card: {
            did: record.did,
            title: record.title,
            shortDescription: record.shortDescription,
            imageUrl: record.imageUrl,
            locationCount: record.locationCount,
            contributorCount: record.contributorCount,
            creatorName: record.creatorName,
            creatorAvatarRef: record.creatorAvatarRef,
            startDate: record.startDate,
            endDate: record.endDate,
          },
        }}
      />
      <main className="min-h-screen bg-background pb-20">
        <header className="mx-auto max-w-6xl px-6 pt-6 lg:px-8">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
              {backLabel ?? "Back"}
            </Link>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary-dark">
              <SproutIcon className="h-3.5 w-3.5" aria-hidden />
              Project
            </span>
            {detail?.badges?.map((badge, index) => (
              <Badge key={`${badge.label}-${index}`} badge={badge} workScopeLabels={workScopeLabels} />
            ))}
          </div>
          <h1
            className="mt-3 max-w-3xl text-4xl font-light italic leading-tight tracking-[-0.035em] text-foreground md:text-5xl"
            style={{ fontFamily: "var(--font-instrument-serif-var)" }}
          >
            {record.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={ownerProfileHref} className="group inline-flex min-w-0 items-center gap-2.5">
              <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                {owner.avatarUrl ? (
                  <Image src={owner.avatarUrl} alt="" fill sizes="36px" unoptimized={!isPdsBlobUrl(owner.avatarUrl)} className="object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-xs font-semibold text-muted-foreground">{owner.displayName.charAt(0).toUpperCase()}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">{owner.displayName}</span>
                <span className="block text-xs text-muted-foreground">{formatRelative(record.createdAt)}</span>
              </span>
            </Link>
            <span className="ml-auto flex items-center gap-2">
              {editHref && editLabel && canManageDonations ? (
                <Link
                  href={editHref}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-primary"
                >
                  <PencilIcon className="h-3.5 w-3.5" aria-hidden />
                  {editLabel}
                </Link>
              ) : null}
              <BumicertShareButton />
            </span>
          </div>
          {record.imageUrl ? (
            <div className="relative mt-6 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-muted sm:aspect-[16/7]">
              <Image
                src={record.imageUrl}
                alt={record.title}
                fill
                priority
                sizes="(min-width: 1024px) 1100px, 100vw"
                unoptimized={!isPdsBlobUrl(record.imageUrl)}
                className="object-cover"
              />
            </div>
          ) : null}
          {/* Like + comment this project — same records + counts as the feed. */}
          {engagementSubjectUri ? (
            <div className="mt-5 border-t border-border-soft pt-3">
              <RecordEngagement subjectUri={engagementSubjectUri} />
            </div>
          ) : null}
        </header>
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 gap-y-8 px-6 pb-8 pt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
          <div className="min-w-0">
            {detail?.richBody && detail.richBody.length > 0 ? (
              <div className="mt-7"><RichText blocks={detail.richBody} className="text-base leading-7 md:text-lg md:leading-8" /></div>
            ) : description ? (
              <p className="mt-7 whitespace-pre-line text-base leading-7 text-foreground/76 md:text-lg md:leading-8">{description}</p>
            ) : null}

            {detail?.sections?.map((section, index) =>
              section.fields.length === 0 ? null : (
                <div key={section.title ?? index} className="mt-8 border-t border-border-soft pt-6">
                  {section.title && (
                    <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{section.title}</h2>
                  )}
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <div key={field.label} className={field.wide ? "sm:col-span-2" : undefined}>
                        <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">{field.label}</dt>
                        <dd className="mt-1 text-sm leading-6 text-foreground">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ),
            )}

            <EvidenceSection
              evidence={{
                boundaries: record.locationUris.length,
                observationSummary,
                timelineCount: timelineEntries.length,
                reviews: reviewCounts,
                detailHref,
                ownerHref: ownerProfileHref,
                anchors,
              }}
            />

            <ProjectGalleryViewer galleries={projectGalleries} variant="bumicert" showProjectFilter={false} hideWhenEmpty compact />
            {hasObservations ? (
              <div id="observations" className="scroll-mt-24">
                <BumicertObservationsGallery observations={observations} />
              </div>
            ) : null}

            {hasPlaces ? (
              <ProjectDetailSection id="places" icon={<MapPinnedIcon className="h-4 w-4" aria-hidden />} title="Places" count={formatNumber(record.locationUris.length)}>
                <SiteBoundariesPanel record={record} />
              </ProjectDetailSection>
            ) : null}

            {showUpdates ? (
              <ProjectDetailSection id="updates" icon={<PaperclipIcon className="h-4 w-4" aria-hidden />} title="Updates & evidence" count={timelineEntries.length > 0 ? formatNumber(timelineEntries.length) : undefined}>
                <BumicertTimeline
                organizationDid={record.did}
                activityUri={record.atUri}
                activityCid={record.cid ?? ""}
                matchActivityUris={matchUris}
                bumicertTitle={record.title}
                canManageEvidence={timelineAccess.canManageEvidence}
                createPermission={timelineAccess.createPermission}
                deletePermission={timelineAccess.deletePermission}
                mutationRepo={timelineAccess.mutationRepo}
                initialEntries={timelineAttachments}
                sources={emptyTimelineSources}
                references={timelineReferences}
                  attachmentsUnavailable={timelineAttachmentsUnavailable}
                />
              </ProjectDetailSection>
            ) : null}

            <ProjectDetailSection id="reviews" icon={<ClipboardCheckIcon className="h-4 w-4" aria-hidden />} title="Reviews" count={reviewCount > 0 ? formatNumber(reviewCount) : undefined}>
              <ReviewsPanel record={record} reviews={reviews} />
            </ProjectDetailSection>

            {showSupport ? (
              <ProjectDetailSection id="support" icon={<HeartIcon className="h-4 w-4" aria-hidden />} title="Support">
                <DonationsPanel
                  record={record}
                  owner={owner}
                  fundingConfig={fundingConfig}
                  authSession={authSession}
                  receipts={donationReceipts}
                  unavailable={donationsUnavailable}
                  canManageDonations={canManageDonations}
                  mutationRepo={certManageAccess.mutationRepo}
                />
              </ProjectDetailSection>
            ) : null}
          </div>

          <aside className="min-w-0">
            <div className="lg:sticky lg:top-24">
              <OverviewSidebar
                record={record}
                detail={detail}
                owner={owner}
                receipts={donationReceipts}
                donationsUnavailable={donationsUnavailable}
                fundingConfig={fundingConfig}
                authSession={authSession}
                canDelete={certManageAccess.canDelete}
                canManageDonations={certManageAccess.canManageDonations}
                mutationRepo={certManageAccess.mutationRepo}
                deleteRedirectHref={ownerProfileHref}
                projectRkey={projectRkey}
                hideOwner
                hideImage
                extra={
                  <ProjectSidebarExtras
                    record={record}
                    detail={detail}
                    workScopeLabels={workScopeLabels}
                    period={period}
                    mapLocationUri={hasPlaces ? record.locationUris[0] : null}
                    recentUpdates={recentUpdates}
                  />
                }
              />
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}

/** Rich at-a-glance block injected under the project sidebar cover image: key
 *  facts, a mini boundary map, and the latest updates — each linking to the
 *  matching inline section. */
function ProjectSidebarExtras({
  record,
  detail,
  workScopeLabels,
  period,
  mapLocationUri,
  recentUpdates,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  workScopeLabels: WorkScopeLabels;
  period: string | null;
  mapLocationUri: string | null;
  recentUpdates: TimelineAttachmentItem[];
}) {
  const facts: Array<{ label: string; value: string }> = [];
  if (period) facts.push({ label: "Active", value: period });
  if (record.locationUris.length > 0) facts.push({ label: "Places", value: formatNumber(record.locationUris.length) });
  if (record.contributorCount > 0) facts.push({ label: "Contributors", value: formatNumber(record.contributorCount) });
  const badges = detail?.badges ?? [];
  // Tracks whether a divider is needed before the next block. The first block
  // omits its leading separator since this is the top of the sidebar.
  let rendered = false;
  const lead = () => {
    const sep = rendered ? <Separator /> : null;
    rendered = true;
    return sep;
  };

  return (
    <>
      {facts.length > 0 || badges.length > 0 ? (
        <>
          {lead()}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">At a glance</h3>
            {facts.length > 0 ? (
              <dl className="space-y-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-xs text-muted-foreground">{fact.label}</dt>
                    <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {badges.slice(0, 6).map((badge, index) => (
                  <span
                    key={`${badge.label}-${index}`}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
                  >
                    {formatWorkScopeTag(badge.label, workScopeLabels)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {mapLocationUri ? (
        <>
          {lead()}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Map</h3>
              <a href="#places" className="text-xs font-medium text-primary transition-colors hover:underline">View places</a>
            </div>
            <a href="#places" className="group relative block overflow-hidden rounded-2xl border border-border" aria-label="View places">
              <iframe
                src={polygonsViewHref(mapLocationUri)}
                className="pointer-events-none h-44 w-full border-0"
                loading="lazy"
                title="Site boundary map"
              />
              <span aria-hidden className="absolute inset-0 transition-colors group-hover:bg-primary/[0.06]" />
            </a>
          </div>
        </>
      ) : null}

      {recentUpdates.length > 0 ? (
        <>
          {lead()}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Latest updates</h3>
              <a href="#updates" className="text-xs font-medium text-primary transition-colors hover:underline">See all</a>
            </div>
            <ul className="space-y-2">
              {recentUpdates.map((entry) => {
                const date = entry.record.createdAt ?? entry.metadata.createdAt;
                return (
                  <li key={entry.metadata.uri ?? entry.metadata.rkey}>
                    <a
                      href="#updates"
                      className="group block rounded-xl border border-border-soft bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-surface-sunken"
                    >
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                        {entry.record.title?.trim() || entry.record.shortDescription?.trim() || "Update"}
                      </p>
                      {date ? <p className="mt-1 text-[11px] text-muted-foreground">{formatRelative(date)}</p> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}

function ProjectDetailSection({
  id,
  icon,
  title,
  count,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  count?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24 border-t border-border-soft pt-7">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <h2 className="font-instrument text-2xl italic leading-none tracking-[-0.02em] text-foreground sm:text-[1.75rem]">{title}</h2>
        {count != null ? <span className="text-sm text-muted-foreground">{count}</span> : null}
      </div>
      {children}
    </section>
  );
}

async function fetchGalleriesForBumicertProject(
  did: string,
  bumicertUri: string,
): Promise<ProjectImageGallery[]> {
  const [projects, galleries] = await Promise.all([
    fetchProjectsByDid(did, 1000).then((page) => page.records),
    fetchProjectImageGalleriesByDid(did),
  ]);
  const project = projects.find((item) => item.bumicertUris.includes(bumicertUri));
  if (!project) return [];
  return attachProjectTitlesToGalleries(
    galleries.filter((gallery) => gallery.projectUri === project.atUri),
    [project],
  );
}

function buildBumicertJsonLd(
  record: BumicertRecord,
  owner: RouteData["owner"],
  fundingConfig: BumicertFundingConfig,
  detailHref: string,
  description: string | null,
  origin: string,
): Record<string, unknown> {
  const accepting = Boolean(fundingConfig?.receivingWallet?.uri) && (fundingConfig?.status ?? "open") === "open";
  const url = `${origin}${detailHref}`;
  return {
    "@context": "https://schema.org",
    "@type": "Project",
    name: record.title,
    url,
    ...(description ? { description } : {}),
    ...(record.imageUrl ? { image: record.imageUrl } : {}),
    ...(record.startDate ? { foundingDate: record.startDate } : {}),
    parentOrganization: {
      "@type": "Organization",
      name: owner.displayName,
      url: `${origin}/account/${encodeURIComponent(owner.urlIdentifier)}`,
    },
    ...(accepting
      ? {
          potentialAction: {
            "@type": "DonateAction",
            target: `${url}?tab=donations`,
            recipient: { "@type": "Organization", name: owner.displayName },
          },
        }
      : {}),
  };
}

async function readRouteData(params: BumicertPageParams): Promise<RouteData> {
  const [{ rkey: encodedRkey }, { did, urlIdentifier }] = await Promise.all([
    params,
    readAccountRouteParams(params),
  ]);
  const rkey = safeDecode(encodedRkey);
  const data = await loadBumicertRouteData(did, rkey, urlIdentifier);
  if (!data) notFound();
  return data;
}

/**
 * Load everything the rich Cert body needs for a given DID + rkey. Returns null
 * (instead of calling notFound) when the record is missing or isn't a Cert, so
 * the project page can fall back gracefully when its linked Cert is gone.
 */
export async function loadBumicertRouteData(
  did: string,
  rkey: string,
  requestedIdentifier: string,
): Promise<RouteData | null> {
  const atUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`;
  const [record, detail, owner, fundingConfig, authSession] = await Promise.all([
    fetchRecordByUri(atUri),
    fetchRecordDetail(atUri).catch(() => null),
    getAccountRouteData(did, requestedIdentifier),
    fetchBumicertFundingConfig(did, rkey).catch(() => null),
    fetchAuthSession(),
  ]);

  if (!record || record.kind !== "bumicert") return null;
  return { record, detail, owner, fundingConfig, authSession, routeIdentifier: requestedIdentifier, urlIdentifier: owner.urlIdentifier };
}

async function fetchBumicertFundingConfig(did: string, rkey: string): Promise<BumicertFundingConfig> {
  const uri = `at://${did}/app.gainforest.funding.config/${rkey}`;
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `
        query BumicertsBumicertFundingConfig($uri: String!) {
          appGainforestFundingConfigByUri(uri: $uri) {
            certifiedProfileData { displayName }
            receivingWallet { ... on AppGainforestFundingConfigEvmLinkRef { uri } }
            status
            goalInUSD
            minDonationInUSD
            maxDonationInUSD
            allowOversell
            createdAt
            updatedAt
          }
        }
      `,
      variables: { uri },
    }),
    next: { revalidate },
  });

  const json = (await response.json()) as {
    data?: {
      appGainforestFundingConfigByUri?: {
        certifiedProfileData?: { displayName?: string | null } | null;
        receivingWallet?: { uri?: string | null } | null;
        status?: string | null;
        goalInUSD?: string | null;
        minDonationInUSD?: string | null;
        maxDonationInUSD?: string | null;
        allowOversell?: boolean | null;
        createdAt?: string | null;
        updatedAt?: string | null;
      } | null;
    };
  };

  const node = json.data?.appGainforestFundingConfigByUri;
  if (!node) return null;

  return {
    receivingWallet: node.receivingWallet?.uri ? { uri: node.receivingWallet.uri } : null,
    status: normalizeFundingStatus(node.status),
    goalInUSD: node.goalInUSD ?? null,
    minDonationInUSD: node.minDonationInUSD ?? null,
    maxDonationInUSD: node.maxDonationInUSD ?? null,
    allowOversell: node.allowOversell ?? null,
    createdAt: node.createdAt ?? null,
    updatedAt: node.updatedAt ?? null,
  };
}

function normalizeFundingStatus(status: string | null | undefined): FundingConfigStatus {
  if (status === "coming-soon" || status === "paused" || status === "closed") return status;
  if (status === "open" || status == null) return "open";
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseDetailTab(value: string | string[] | undefined): BumicertDetailTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return BUMICERT_DETAIL_TABS.includes(raw as BumicertDetailTab) ? (raw as BumicertDetailTab) : "overview";
}

function polygonsViewHref(locationUri: string): string {
  return `https://polygons-gainforest.vercel.app/view?${new URLSearchParams({
    certifiedLocationRecordUri: locationUri,
  }).toString()}`;
}

function OverviewSidebar({
  record,
  detail,
  owner,
  receipts,
  donationsUnavailable,
  fundingConfig,
  authSession,
  canDelete,
  canManageDonations,
  mutationRepo,
  deleteRedirectHref,
  projectRkey,
  extra,
  hideOwner,
  hideImage,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  owner: RouteData["owner"];
  receipts: FundingReceipt[];
  donationsUnavailable: boolean;
  fundingConfig: BumicertFundingConfig;
  authSession: RouteData["authSession"];
  canDelete: boolean;
  canManageDonations: boolean;
  mutationRepo?: string;
  deleteRedirectHref: string;
  /** When set, the delete action removes the project (not just the Cert). */
  projectRkey?: string;
  /** Extra rich content rendered under the cover image (project sidebar). */
  extra?: ReactNode;
  /** Hide the owner row — the project page shows it in the page header. */
  hideOwner?: boolean;
  /** Hide the cover image — the project page shows it as a hero. */
  hideImage?: boolean;
}) {
  const orgLinks = buildOrganizationLinks(owner, detail);

  return (
    <div className="space-y-4">
      {!hideOwner ? (
        <div className="flex items-center gap-3">
          <Link href={`/account/${encodeURIComponent(owner.urlIdentifier)}`} className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {owner.avatarUrl ? (
              <Image
                src={owner.avatarUrl}
                alt={owner.displayName}
                fill
                sizes="36px"
                unoptimized={!isPdsBlobUrl(owner.avatarUrl)}
                className="object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs font-semibold text-muted-foreground">
                {owner.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <Link href={`/account/${encodeURIComponent(owner.urlIdentifier)}`} className="group flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium leading-tight text-foreground transition-colors group-hover:text-primary">
              {owner.displayName}
            </span>
            <span className="text-xs leading-tight text-muted-foreground">{formatRelative(record.createdAt)}</span>
          </Link>
          <BumicertShareButton />
        </div>
      ) : null}

      {!hideImage ? (
        <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-3xl border border-border bg-muted">
          {record.imageUrl ? (
            <Image
              src={record.imageUrl}
              alt={record.title}
              fill
              priority
              sizes="(min-width: 1024px) 320px, 100vw"
              unoptimized={!isPdsBlobUrl(record.imageUrl)}
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <SproutIcon className="h-10 w-10 opacity-40" />
            </div>
          )}
        </div>
      ) : null}

      {extra}

      <Separator />

      <AboutOrganizationSection owner={owner} links={orgLinks} />

      <Separator />

      <SidebarDonations
        record={record}
        owner={owner}
        receipts={receipts}
        unavailable={donationsUnavailable}
        fundingConfig={fundingConfig}
        authSession={authSession}
        canManageDonations={canManageDonations}
        mutationRepo={mutationRepo}
      />

      {canDelete ? (
        <>
          <Separator />
          <BumicertDeleteAction
            rkey={record.rkey}
            title={record.title}
            mutationRepo={mutationRepo}
            redirectHref={deleteRedirectHref}
            projectRkey={projectRkey}
          />
        </>
      ) : null}
    </div>
  );
}

function AboutOrganizationSection({
  owner,
  links,
}: {
  owner: RouteData["owner"];
  links: OrganizationLinkItem[];
}) {
  const accountHref = `/account/${encodeURIComponent(owner.urlIdentifier)}`;
  const allLinks: OrganizationLinkItem[] = [
    ...links,
    {
      href: accountHref,
      platform: "link",
      label: "Learn More",
      description: `View ${owner.displayName}'s full profile.`,
      external: false,
    },
  ];
  const learnMoreIsFullWidth = allLinks.length % 2 === 1;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        About {owner.displayName}
      </h3>
      {owner.description ? (
        <p className="line-clamp-5 text-sm leading-6 text-foreground/70">{owner.description}</p>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {owner.displayName} is the organization behind this Cert.
        </p>
      )}
      {owner.country ? (
        <dl className="text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Country</dt>
            <dd className="truncate text-foreground">{formatCountry(owner.country)}</dd>
          </div>
        </dl>
      ) : null}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {allLinks.map((link, index) => {
          const isLearnMore = index === allLinks.length - 1;
          const isExternal = link.external !== false;
          return (
            <Link
              key={`${link.platform}-${link.href}`}
              href={link.href}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noreferrer" : undefined}
              className={`group inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-full border border-border-soft bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 hover:text-primary ${isLearnMore && learnMoreIsFullWidth ? "col-span-2" : ""}`}
            >
              <SocialGlyph platform={link.platform} />
              <span className="truncate">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarDonations({
  record,
  owner,
  receipts,
  unavailable,
  fundingConfig,
  authSession,
  canManageDonations,
  mutationRepo,
}: {
  record: BumicertRecord;
  owner: RouteData["owner"];
  receipts: FundingReceipt[];
  unavailable: boolean;
  fundingConfig: BumicertFundingConfig;
  authSession: RouteData["authSession"];
  canManageDonations: boolean;
  mutationRepo?: string;
}) {
  const usdReceipts = receipts.filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()));
  const totalUsd = usdReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const hasReceipts = receipts.length > 0;
  const donationStatus = getDonationStatus(fundingConfig, unavailable);
  const goalUsd = parseGoalUsd(fundingConfig);

  // No funding config, no history, and no permission to configure donations:
  // skip the dead commerce UI ($0 stats + disabled button) — a short note is more honest.
  if (!canManageDonations && donationStatus.kind === "not-applicable" && !hasReceipts) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Donations
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          This project is not accepting donations yet. Explore the story, places, and evidence — or follow {owner.displayName} for updates.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Donations
      </h3>
      {!canManageDonations ? (
        <div className="flex items-center gap-2 text-sm">
          {donationStatus.kind === "open" ? (
            <CircleDotIcon className="h-3.5 w-3.5 text-primary" />
          ) : (
            <BanIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={donationStatus.kind === "open" ? "text-primary" : "text-muted-foreground"}>
            {donationStatus.label}
          </span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Raised</p>
          <p className="mt-0.5 text-lg font-medium text-foreground">{formatCompactUsd(totalUsd)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Donations</p>
          <p className="mt-0.5 text-lg font-medium text-foreground">{formatCompact(receipts.length)}</p>
        </div>
      </div>
      {goalUsd !== null && donationStatus.kind === "open" ? (
        <FundingProgress raisedUsd={totalUsd} goalUsd={goalUsd} />
      ) : null}
      {canManageDonations ? (
        <FundingStatus ownerDid={record.did} bumicertRkey={record.rkey} fundingConfig={fundingConfig} mutationRepo={mutationRepo} />
      ) : donationStatus.kind === "open" ? (
        <DonateButton
          bumicert={{
            organizationDid: record.did,
            rkey: record.rkey,
            title: record.title,
            organizationName: owner.displayName,
          }}
          fundingConfig={fundingConfig}
          authSession={authSession}
          disabled={false}
          label={hasReceipts ? "Donate again" : "Donate"}
        />
      ) : null}
      {donationStatus.kind === "open" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Completed donations appear publicly so supporters can see the impact.
        </p>
      ) : null}
    </div>
  );
}

function parseGoalUsd(fundingConfig: BumicertFundingConfig): number | null {
  const raw = fundingConfig?.goalInUSD;
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function FundingProgress({ raisedUsd, goalUsd }: { raisedUsd: number; goalUsd: number }) {
  const ratio = Math.max(0, Math.min(1, raisedUsd / goalUsd));
  const percent = Math.round(ratio * 100);
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Funding progress: ${percent}% of ${formatCompactUsd(goalUsd)} goal`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.max(percent, 2)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{percent}%</span> of {formatCompactUsd(goalUsd)} goal
      </p>
    </div>
  );
}

function getDonationStatus(
  fundingConfig: BumicertFundingConfig,
  unavailable: boolean,
): { kind: "open" | "unavailable" | "not-applicable" | "inactive"; label: string } {
  if (unavailable) return { kind: "unavailable", label: "Donation status unavailable" };
  if (!fundingConfig || !fundingConfig.receivingWallet?.uri) {
    return { kind: "not-applicable", label: "Donations are not applicable" };
  }
  const status = fundingConfig.status ?? "open";
  if (status === "open") return { kind: "open", label: "Accepting donations" };
  if (status === "coming-soon") return { kind: "inactive", label: "Donations coming soon" };
  if (status === "paused") return { kind: "inactive", label: "Donations paused" };
  if (status === "closed") return { kind: "inactive", label: "Donations closed" };
  return { kind: "unavailable", label: "Donation status unavailable" };
}

type OrganizationLinkItem = {
  href: string;
  platform: string;
  label: string;
  description: string;
  external?: boolean;
};

function buildOrganizationLinks(
  owner: RouteData["owner"],
  detail: RouteData["detail"],
): OrganizationLinkItem[] {
  const links: OrganizationLinkItem[] = [];
  const seen = new Set<string>();
  const seenPlatforms = new Set<string>();

  function add(item: OrganizationLinkItem) {
    if (seen.has(item.href)) return;
    // One button per platform — orgs sometimes list e.g. two YouTube URLs,
    // which rendered as confusing duplicate icons in the sidebar.
    if (item.platform !== "link" && item.platform !== "website" && seenPlatforms.has(item.platform)) return;
    seen.add(item.href);
    seenPlatforms.add(item.platform);
    links.push(item);
  }

  if (owner.website) {
    add({
      href: owner.website,
      platform: "website",
      label: "Website",
      description: `Visit ${owner.displayName}'s main website at ${externalHost(owner.website)}.`,
    });
  }

  for (const social of detail?.socials ?? []) {
    add({
      href: social.href,
      platform: social.platform,
      label: socialPlatformLabel(social.platform),
      description: socialPlatformDescription(social.platform, owner.displayName, social.href),
    });
  }

  return links;
}

function socialPlatformDescription(platform: string, organizationName: string, href: string): string {
  const host = href.startsWith("mailto:") ? "email" : externalHost(href);
  const descriptions: Record<string, string> = {
    facebook: `Follow ${organizationName} on Facebook for public updates.`,
    instagram: `See field photos and updates from ${organizationName} on Instagram.`,
    youtube: `Watch videos and project stories from ${organizationName}.`,
    linkedin: `View ${organizationName}'s professional updates on LinkedIn.`,
    x: `Follow short updates from ${organizationName} on X.`,
    telegram: `Open ${organizationName}'s Telegram channel or community.`,
    tiktok: `Watch short-form updates from ${organizationName}.`,
    github: `See public project updates from ${organizationName}.`,
    bluesky: `Follow ${organizationName} on Bluesky.`,
    discord: `Join ${organizationName}'s Discord community.`,
    email: `Contact ${organizationName} by email.`,
    website: `Open ${organizationName}'s website at ${host}.`,
    link: `Open this external resource from ${organizationName}.`,
  };
  return descriptions[platform] ?? `Open ${host} for more from ${organizationName}.`;
}

function Badge({ badge, workScopeLabels }: { badge: DetailBadge; workScopeLabels: WorkScopeLabels }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium ${BADGE_TONE[badge.tone]}`}>
      {formatWorkScopeTag(badge.label, workScopeLabels)}
    </span>
  );
}

type EvidenceInfo = {
  boundaries: number;
  observationSummary: ObservationSummary | null;
  timelineCount: number | null;
  reviews: ReviewCounts | null;
  detailHref: string;
  ownerHref: string;
  /**
   * In-page anchor hrefs for the integrated layout. When set, the evidence
   * chips scroll to inline sections instead of switching tabs.
   */
  anchors?: { boundaries: string; sightings: string; timeline: string; reviews: string };
};

function OverviewPanel({
  record,
  detail,
  description,
  observations,
  projectGalleries,
  evidence,
  workScopeLabels,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  description: string | null | undefined;
  observations: OccurrenceRecord[];
  projectGalleries: ProjectImageGallery[];
  evidence: EvidenceInfo;
  workScopeLabels: WorkScopeLabels;
}) {
  return (
    <article className="py-1">
      <h1
        className="max-w-3xl text-4xl font-light italic leading-tight tracking-[-0.035em] text-foreground md:text-5xl"
        style={{ fontFamily: "var(--font-instrument-serif-var)" }}
      >
        {record.title}
      </h1>

      {detail?.badges && detail.badges.length > 0 && (
        <div className="mb-6 mt-6 flex flex-wrap gap-2.5">
          {detail.badges.map((badge, index) => (
            <Badge key={`${badge.label}-${index}`} badge={badge} workScopeLabels={workScopeLabels} />
          ))}
        </div>
      )}

      {detail?.richBody && detail.richBody.length > 0 ? (
        <RichText blocks={detail.richBody} className="text-base leading-7 md:text-lg md:leading-8" />
      ) : description ? (
        <p className="mt-6 whitespace-pre-line text-base leading-7 text-foreground/76 md:text-lg md:leading-8">{description}</p>
      ) : (
        <p className="text-[15px] leading-8 text-muted-foreground">
          No long-form description has been published for this Cert yet.
        </p>
      )}

      {detail?.sections?.map((section, index) =>
        section.fields.length === 0 ? null : (
          <div key={section.title ?? index} className="mt-8 border-t border-border-soft pt-6">
            {section.title && (
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {section.title}
              </h2>
            )}
            <dl className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.label} className={field.wide ? "sm:col-span-2" : undefined}>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/45">
                    {field.label}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-foreground">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ),
      )}

      <EvidenceSection evidence={evidence} />

      <ProjectGalleryViewer
        galleries={projectGalleries}
        variant="bumicert"
        showProjectFilter={false}
        hideWhenEmpty
        compact
      />

      <BumicertObservationsGallery observations={observations} />
    </article>
  );
}

/**
 * The trust meter: how much verifiable material backs this claim. Each chip
 * links to where the evidence lives, and zero-states stay visible (muted) so
 * evidence-rich and evidence-light Bumicerts are distinguishable at a glance.
 */
function EvidenceSection({ evidence }: { evidence: EvidenceInfo }) {
  const { boundaries, observationSummary, timelineCount, reviews, detailHref, ownerHref } = evidence;

  const reviewVoices = reviews ? reviews.evaluations + reviews.comments : 0;
  const reviewLabel = !reviews || reviewVoices === 0
    ? "No reviews yet"
    : [
        reviews.evaluations > 0 ? `${formatNumber(reviews.evaluations)} evaluation${reviews.evaluations === 1 ? "" : "s"}` : null,
        reviews.comments > 0 ? `${formatNumber(reviews.comments)} comment${reviews.comments === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · ");

  const anchors = evidence.anchors;
  const chips: Array<{ key: string; href: string; icon: ReactNode; label: string; present: boolean }> = [
    {
      key: "boundaries",
      href: anchors?.boundaries ?? `${detailHref}?tab=site-boundaries`,
      icon: <MapPinnedIcon className="h-3.5 w-3.5" aria-hidden />,
      label: boundaries > 0
        ? `${formatNumber(boundaries)} site ${boundaries === 1 ? "boundary" : "boundaries"} mapped`
        : "No site boundaries yet",
      present: boundaries > 0,
    },
    ...(observationSummary
      ? [{
          key: "sightings",
          href: anchors?.sightings ?? ownerHref,
          icon: <LeafIcon className="h-3.5 w-3.5" aria-hidden />,
          label: observationSummary.count > 0
            ? `${formatCompact(observationSummary.count)} nature sighting${observationSummary.count === 1 ? "" : "s"}${
                observationSummary.latestAt ? ` · latest ${formatRelative(observationSummary.latestAt)}` : ""
              }`
            : "No nature sightings yet",
          present: observationSummary.count > 0,
        }]
      : []),
    ...(timelineCount !== null
      ? [{
          key: "timeline",
          href: anchors?.timeline ?? `${detailHref}?tab=timeline`,
          icon: <PaperclipIcon className="h-3.5 w-3.5" aria-hidden />,
          label: timelineCount > 0
            ? `${formatNumber(timelineCount)} timeline item${timelineCount === 1 ? "" : "s"}`
            : "No timeline evidence yet",
          present: timelineCount > 0,
        }]
      : []),
    ...(reviews
      ? [{
          key: "reviews",
          href: anchors?.reviews ?? `${detailHref}?tab=reviews`,
          icon: <ClipboardCheckIcon className="h-3.5 w-3.5" aria-hidden />,
          label: reviewLabel,
          present: reviewVoices > 0,
        }]
      : []),
  ];

  if (chips.length === 0) return null;

  return (
    <div className="mt-8 border-t border-border-soft pt-6">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Evidence
      </h2>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              chip.present
                ? "border-primary/25 bg-primary/[0.07] text-foreground hover:border-primary/50 hover:text-primary"
                : "border-border-soft bg-surface text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <span className={chip.present ? "text-primary" : "text-muted-foreground/70"}>{chip.icon}</span>
            {chip.label}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Evidence and reviews live on the open ATProto network and can be inspected by anyone.
      </p>
    </div>
  );
}

/**
 * Reviews tab — third-party judgement about this claim, read straight off the
 * open network: formal `org.hypercerts.context.evaluation` records plus
 * threaded `org.impactindexer.review.comment` discussion (including comments
 * authored by Simocracy AI sims, which are labelled as such).
 */
function ReviewsPanel({ record, reviews }: { record: BumicertRecord; reviews: BumicertReviews }) {
  const { evaluations, comments } = reviews;
  const isEmpty = evaluations.length === 0 && comments.length === 0;

  return (
    <article className="py-1">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Independent evaluations and public comments attached to this Cert on the open ATProto
        network. Anyone — auditors, community members, or AI agents — can publish a review; nothing
        here is written or curated by {record.creatorName ?? "the project"} itself.
      </p>

      <div className="mt-8">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Evaluations{evaluations.length > 0 ? ` · ${evaluations.length}` : ""}
        </h2>
        {evaluations.length === 0 ? (
          <p className="rounded-2xl border border-border-soft bg-surface p-4 text-sm leading-6 text-muted-foreground">
            No formal evaluations yet. An evaluation is an{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">org.hypercerts.context.evaluation</code>{" "}
            record — a signed summary, optional score, and supporting reports published against this claim.
          </p>
        ) : (
          <div className="grid gap-3">
            {evaluations.map((evaluation) => (
              <div key={evaluation.uri} className="rounded-2xl border border-border-soft bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <AuthorInline did={evaluation.did} />
                  <div className="flex items-center gap-2">
                    {evaluation.score ? (
                      <span
                        className="inline-flex items-baseline gap-0.5 rounded-full border border-primary/25 bg-primary/[0.08] px-2.5 py-1 text-sm font-semibold text-primary"
                        aria-label={`Score: ${evaluation.score.value} out of ${evaluation.score.max}`}
                      >
                        {evaluation.score.value}
                        <span className="text-[11px] font-medium text-primary/70">/{evaluation.score.max}</span>
                      </span>
                    ) : null}
                    {evaluation.createdAt ? (
                      <span className="text-xs text-muted-foreground" title={formatDateTime(evaluation.createdAt)}>
                        {formatRelative(evaluation.createdAt)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{evaluation.summary}</p>
                {evaluation.contentUris.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {evaluation.contentUris.map((uri) => (
                      <a
                        key={uri}
                        href={uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-soft bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <ExternalLinkIcon className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{formatReportLabel(uri)}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Comments{comments.length > 0 ? ` · ${comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)}` : ""}
        </h2>
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-border-soft bg-surface p-4 text-sm leading-6 text-muted-foreground">
            No public comments yet. Comments posted on this claim from the wider network — including
            reviews by Simocracy AI sims — will appear here.
          </p>
        ) : (
          <div className="grid gap-3">
            {comments.map((comment) => (
              <ReviewCommentCard key={comment.uri} comment={comment} />
            ))}
          </div>
        )}
      </div>

      {isEmpty ? null : (
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Reviews are independent records on their authors’ accounts; they are shown here unedited.
        </p>
      )}
    </article>
  );
}

function ReviewCommentCard({ comment, nested = false }: { comment: ReviewComment; nested?: boolean }) {
  return (
    <div className={nested ? "border-l-2 border-border-soft pl-4" : "rounded-2xl border border-border-soft bg-surface p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {comment.sim ? <SimIdentity name={comment.sim.name} uri={comment.sim.uri} /> : <AuthorInline did={comment.did} />}
        {comment.createdAt ? (
          <span className="text-xs text-muted-foreground" title={formatDateTime(comment.createdAt)}>
            {formatRelative(comment.createdAt)}
          </span>
        ) : null}
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-foreground">{comment.text}</p>
      {comment.replies.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {comment.replies.map((reply) => (
            <ReviewCommentCard key={reply.uri} comment={reply} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Sim-authored comments are labelled and linked to the sim's public page. */
function SimIdentity({ name, uri }: { name: string; uri: string | null }) {
  const match = uri?.match(/^at:\/\/([^/]+)\/org\.simocracy\.sim\/([^/]+)$/);
  const href = match ? `https://simocracy.org/sims/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}` : null;
  const body = (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
        <BotIcon className="h-3 w-3" aria-hidden />
      </span>
      <span className="text-sm font-medium text-foreground">{name}</span>
      <span className="rounded-full border border-border-soft bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        AI sim
      </span>
    </span>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="transition-opacity hover:opacity-80">
      {body}
    </a>
  ) : (
    body
  );
}

function formatReportLabel(uri: string): string {
  try {
    const url = new URL(uri);
    const file = url.pathname.split("/").filter(Boolean).pop();
    return file ? `${url.hostname}/…/${file}` : url.hostname;
  } catch {
    return uri;
  }
}

function SiteBoundariesPanel({ record }: { record: BumicertRecord }) {
  const firstLocationUri = record.locationUris[0] ?? null;

  return (
    <article className="py-1">
      {firstLocationUri ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-muted/30">
            <iframe
              src={polygonsViewHref(firstLocationUri)}
              className="h-[420px] w-full border-0"
              title="Site boundaries map"
              loading="lazy"
            />
          </div>

          <div className="mt-5 grid gap-3">
            {record.locationUris.map((uri, index) => (
              <Link
                key={uri}
                href={polygonsViewHref(uri)}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-sunken"
              >
                <span>Site boundary {index + 1}</span>
                <ExternalLinkIcon className="h-3.5 w-3.5 text-foreground/35 transition-colors group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MapPinnedIcon className="h-8 w-8" />}
          title="No site boundaries linked"
          body="This Cert does not currently include mapped site boundaries."
        />
      )}
    </article>
  );
}

function DonationsPanel({
  record,
  owner,
  fundingConfig,
  authSession,
  receipts,
  unavailable,
  canManageDonations,
  mutationRepo,
}: {
  record: BumicertRecord;
  owner: RouteData["owner"];
  fundingConfig: BumicertFundingConfig;
  authSession: RouteData["authSession"];
  receipts: FundingReceipt[];
  unavailable: boolean;
  canManageDonations: boolean;
  mutationRepo?: string;
}) {
  const usdReceipts = receipts.filter((receipt) => ["USD", "USDC"].includes(receipt.currency.toUpperCase()));
  const totalUsd = usdReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const donationEntries = buildDonationLeaderboard(usdReceipts);
  const donorCount = donationEntries.length;
  const donationStatus = getDonationStatus(fundingConfig, unavailable);
  const goalUsd = parseGoalUsd(fundingConfig);
  const showSupportCard = !unavailable && (canManageDonations || donationStatus.kind !== "not-applicable");
  const stats: StatsTileItem[] = [
    {
      label: "raised",
      value: formatCompactUsd(totalUsd),
      icon: <LeafIcon />,
      accent: true,
    },
    {
      label: "Completed donations",
      value: formatCompact(usdReceipts.length),
      icon: <GiftIcon />,
    },
    {
      label: "donors",
      value: formatCompact(donorCount),
      icon: <UsersRoundIcon />,
      accent: true,
    },
  ];

  return (
    <article className="space-y-5 py-1">
      {showSupportCard ? (
        <div className="overflow-hidden rounded-3xl bg-card/75 p-5 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-instrument text-3xl font-light italic leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
                Support this project
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Your donation supports {owner.displayName} and appears with this project story once completed.
              </p>
              {goalUsd !== null && donationStatus.kind === "open" ? (
                <div className="mt-4 max-w-xl">
                  <FundingProgress raisedUsd={totalUsd} goalUsd={goalUsd} />
                </div>
              ) : null}
            </div>
            <div className="w-full sm:w-44 sm:shrink-0">
              {canManageDonations ? (
                <FundingStatus ownerDid={record.did} bumicertRkey={record.rkey} fundingConfig={fundingConfig} mutationRepo={mutationRepo} />
              ) : (
                <>
                  <DonateButton
                    bumicert={{
                      organizationDid: record.did,
                      rkey: record.rkey,
                      title: record.title,
                      organizationName: owner.displayName,
                    }}
                    fundingConfig={fundingConfig}
                    authSession={authSession}
                    disabled={donationStatus.kind !== "open"}
                    label={donationStatus.kind === "open" && receipts.length > 0 ? "Donate again" : "Donate"}
                  />
                  {donationStatus.kind !== "open" ? (
                    <p className="mt-2 text-center text-xs text-muted-foreground">{donationStatus.label}</p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {unavailable ? (
        <EmptyState
          icon={<HeartIcon className="h-8 w-8" />}
          title="Donation information is unavailable"
          body="We could not load donations for this project. Try again later on this page."
          variant="leaderboard"
        />
      ) : receipts.length === 0 ? (
        <EmptyState
          icon={<HeartIcon className="h-8 w-8" />}
          title={donationStatus.kind === "not-applicable" && !canManageDonations ? "Not accepting donations yet" : "No donations yet"}
          body={
            donationStatus.kind === "not-applicable" && !canManageDonations
              ? `${owner.displayName} has not enabled donations for this project. Check the story and evidence tabs in the meantime.`
              : "Be the first to support this project story."
          }
          variant="leaderboard"
        />
      ) : (
        <div className="space-y-5">
          <StatsTileGrid items={stats} columns={3} />

          {donationEntries.length > 0 ? (
            <div className="overflow-hidden rounded-3xl bg-card/70 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur divide-y divide-border/60">
              {donationEntries.map((entry) => (
                <DonationLeaderboardRow key={entry.key} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<HeartIcon className="h-8 w-8" />}
              title="No donation totals yet"
              body="Completed donations for this Cert will appear here."
              variant="leaderboard"
            />
          )}
        </div>
      )}
    </article>
  );
}

function TimelinePanel({
  record,
  detail,
  period,
  workScopeLabels,
}: {
  record: BumicertRecord;
  detail: RouteData["detail"];
  period: string;
  workScopeLabels: WorkScopeLabels;
}) {
  const events = [
    {
      title: "Cert published",
      body: record.shortDescription ?? "This project story was published.",
      meta: formatDateTime(record.createdAt),
    },
    record.locationUris.length > 0
      ? {
          title: "Site boundaries added",
          body: `${formatNumber(record.locationUris.length)} ${record.locationUris.length === 1 ? "site boundary" : "site boundaries"} linked to this Cert.`,
          meta: "Site Boundaries",
        }
      : null,
    record.startDate || record.endDate
      ? {
          title: "Activity period",
          body: period,
          meta: "Project timeline",
        }
      : null,
  ].filter((event): event is { title: string; body: string; meta: string } => event !== null);

  return (
    <article className="py-1">
      <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-border-soft">
        {events.map((event) => (
          <div key={event.title} className="relative flex gap-4">
            <span className="mt-1 h-6 w-6 shrink-0 rounded-full border border-primary/30 bg-primary/10 ring-4 ring-card" />
            <div className="min-w-0 rounded-2xl border border-border-soft bg-surface p-4">
              <p className="text-sm font-medium text-foreground">{event.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.body}</p>
              <p className="mt-2 text-xs text-foreground/45">{event.meta}</p>
            </div>
          </div>
        ))}
      </div>

      {detail?.badges?.length ? (
        <div className="mt-6 border-t border-border-soft pt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            What this covers
          </p>
          <div className="flex flex-wrap gap-2">
            {detail.badges.map((badge, index) => (
              <Badge key={`${badge.label}-${index}`} badge={badge} workScopeLabels={workScopeLabels} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MoreBumicertsSection({
  bumicerts,
  owner,
}: {
  bumicerts: BumicertRecord[];
  owner: RouteData["owner"];
}) {
  const viewAllHref = `/account/${encodeURIComponent(owner.urlIdentifier)}/certs`;

  return (
    <section className="min-w-0 lg:col-span-2">
      <Separator className="my-2" />
      <div className="mb-4 flex items-center justify-between gap-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">More Certs from this Organization</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">{owner.displayName}</p>
        </div>
        <Link
          href={viewAllHref}
          className="shrink-0 rounded-full border border-border-soft px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary/40 hover:text-primary"
        >
          See all
        </Link>
      </div>
      <div
        className="flex gap-4 overflow-x-auto pb-2"
        style={{
          WebkitMaskImage: "linear-gradient(to right, black 0%, black calc(100% - 56px), transparent 100%)",
          maskImage: "linear-gradient(to right, black 0%, black calc(100% - 56px), transparent 100%)",
        }}
      >
        {bumicerts.map((item) => (
          <Link key={item.id} href={localBumicertHref(owner.urlIdentifier, item.rkey)} className="block w-[260px] shrink-0">
            <BumicertsBumicertCard record={item} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function externalHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

type DonationLeaderboardEntry = {
  key: string;
  rank: number;
  donor: DonorRef;
  totalAmount: number;
  donationCount: number;
  lastDonatedAt: string | null;
  latestReceipt: FundingReceipt;
};

const DONATION_RANK_TIERS: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300/35 to-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  2: "bg-gradient-to-br from-slate-300/40 to-slate-400/10 text-slate-600 ring-slate-400/25 dark:text-slate-300",
  3: "bg-gradient-to-br from-orange-300/35 to-orange-500/10 text-orange-700 ring-orange-500/25 dark:text-orange-300",
};

const DONATION_RANK_BADGES: Record<number, { Icon: typeof CrownIcon; label: string }> = {
  1: { Icon: CrownIcon, label: "Top supporter" },
  2: { Icon: SparklesIcon, label: "Steady giver" },
  3: { Icon: SproutIcon, label: "Growing impact" },
};

function buildDonationLeaderboard(receipts: FundingReceipt[]): DonationLeaderboardEntry[] {
  const entries = new Map<string, Omit<DonationLeaderboardEntry, "rank">>();

  for (const receipt of receipts) {
    const key = receipt.from ? `${receipt.from.type}:${receipt.from.id}` : `anonymous:${receipt.uri}`;
    const existing = entries.get(key);
    const receiptDate = receipt.occurredAt ?? receipt.createdAt;

    if (existing) {
      existing.totalAmount += receipt.amount;
      existing.donationCount += 1;
      if (dateTimeValue(receiptDate) > dateTimeValue(existing.lastDonatedAt)) {
        existing.lastDonatedAt = receiptDate;
        existing.latestReceipt = receipt;
      }
    } else {
      entries.set(key, {
        key,
        donor: receipt.from,
        totalAmount: receipt.amount,
        donationCount: 1,
        lastDonatedAt: receiptDate,
        latestReceipt: receipt,
      });
    }
  }

  return Array.from(entries.values())
    .sort((a, b) => (b.totalAmount - a.totalAmount) || (b.donationCount - a.donationCount) || (dateTimeValue(b.lastDonatedAt) - dateTimeValue(a.lastDonatedAt)))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function DonationRankBadge({ rank }: { rank: number }) {
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={[
        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ring-1",
        DONATION_RANK_TIERS[rank] ?? "bg-muted/50 text-muted-foreground ring-foreground/5",
      ].join(" ")}
    >
      {rank}
    </span>
  );
}

function DonationSupporterBadge({ rank }: { rank: number }) {
  const badge = DONATION_RANK_BADGES[rank];
  if (!badge) return null;
  const { Icon, label } = badge;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium leading-none text-primary">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function DonationLeaderboardRow({ entry }: { entry: DonationLeaderboardEntry }) {
  const actionHref = donationEntryHref(entry);
  const content = (
    <>
      <DonationRankBadge rank={entry.rank} />

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-foreground">
          {entry.donor?.type === "did" ? (
            <span className="min-w-0 truncate">
              <AuthorInline did={entry.donor.id} />
            </span>
          ) : (
            <>
              <WalletIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 truncate">Anonymous supporter</span>
            </>
          )}
        </p>
        <div className="flex min-w-0 flex-col items-start gap-1 text-[13px] leading-snug text-muted-foreground">
          <DonationSupporterBadge rank={entry.rank} />
          <span className="w-full min-w-0 whitespace-normal break-words">{donationEntrySummary(entry)}</span>
        </div>
      </div>

      <span className="shrink-0 whitespace-nowrap pt-0.5 text-[15px] font-bold tabular-nums text-primary sm:text-[17px]">
        {formatCompactUsd(entry.totalAmount)}
      </span>

      {actionHref ? (
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary sm:size-5"
        />
      ) : null}
    </>
  );
  const className = "group flex items-start gap-3.5 px-4 py-[18px] transition-colors duration-200 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-4 sm:px-5 sm:py-5";

  if (entry.donor?.type === "did") {
    return (
      <PreferredAccountLink
        did={entry.donor.id}
        aria-label="Open supporter profile"
        className={className}
      >
        {content}
      </PreferredAccountLink>
    );
  }

  if (actionHref) {
    return (
      <Link
        href={actionHref}
        target="_blank"
        rel="noreferrer"
        aria-label="Open payment details"
        className={className}
      >
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

function donationEntryHref(entry: DonationLeaderboardEntry): string | null {
  if (entry.donor?.type === "did") return null;
  return blockExplorerUrl(entry.latestReceipt.txHash, entry.latestReceipt.paymentNetwork);
}

function donationEntrySummary(entry: DonationLeaderboardEntry): string {
  const donationCount = `${formatNumber(entry.donationCount)} ${entry.donationCount === 1 ? "donation" : "donations"}`;
  const lastGift = entry.lastDonatedAt ? `Last donation ${formatRelative(entry.lastDonatedAt)}` : null;
  return lastGift ? `${donationCount} · ${lastGift}` : donationCount;
}

function dateTimeValue(date: string | null): number {
  if (!date) return 0;
  const time = Date.parse(date);
  return Number.isNaN(time) ? 0 : time;
}

function EmptyState({ icon, title, body, variant = "default" }: { icon: ReactNode; title: string; body: string; variant?: "default" | "leaderboard" }) {
  if (variant === "leaderboard") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-card/75 py-16 text-center text-muted-foreground shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <p className="font-garamond text-3xl font-light text-foreground">{title}</p>
        <p className="font-instrument max-w-sm text-base italic text-foreground/70">{body}</p>
      </div>
    );
  }

  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border-soft bg-surface/50 px-6 py-12 text-center">
      <div className="text-muted-foreground/50">{icon}</div>
      <h2 className="mt-4 text-lg font-medium text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function socialPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    youtube: "YouTube",
    linkedin: "LinkedIn",
    x: "X",
    telegram: "Telegram",
    tiktok: "TikTok",
    github: "GitHub",
    bluesky: "Bluesky",
    discord: "Discord",
    email: "Email",
    website: "Website",
    link: "Link",
  };
  return labels[platform] ?? "Link";
}

