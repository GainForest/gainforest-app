import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import {
  fetchAudioByDid,
  fetchBumicertsByDid,
  walkOccurrences,
  fetchLocationsByDid,
  fetchProjectsByDid,
  fetchTimelineAttachmentsByDid,
  fetchTreeDatasetsByDid,
  occurrenceFromPdsRecord,
  type OccurrenceRecord,
  type TimelineAttachmentItem,
} from "@/app/_lib/indexer";
import { BumicertTimeline } from "@/app/cert/[did]/[rkey]/_components/timeline/BumicertTimeline";
import { getEntriesForActivity } from "@/app/cert/[did]/[rkey]/_components/timeline/attachmentSubjects";
import { resolveTimelineReferences } from "@/app/cert/[did]/[rkey]/_components/timeline/timelineReferenceResolver";
import { canCreateRecord, canDeleteRecord } from "./_lib/cgs-permissions";
import { profileBasePath } from "@/lib/links";
import { ProjectSitesManagerClient } from "./projects/[rkey]/sites/_components/ProjectSitesManagerClient";
import { droneAppHref } from "@/app/_lib/urls";
import { listLatestPdsRecords, resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import { RecordExplorer } from "@/app/_components/RecordExplorer";
import { InlineCardGridSkeleton } from "@/app/_components/PageLoadingSkeletons";
import { Button } from "@/components/ui/button";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AccountSettingsSections } from "@/app/account/_components/AccountSettingsSections";
import Container from "@/components/ui/container";
import { ManageOverview } from "./_components/ManageOverview";
import { ManageDashboard } from "./_components/ManageDashboard";
import { GroupMembers } from "./groups/_components/GroupMembers";
import type { CgsRole } from "./_lib/cgs";
import { ManageProjectsClient } from "./projects/_components/ManageProjectsClient";
import { ProjectGalleryManagerClient } from "./projects/[rkey]/gallery/_components/ProjectGalleryManagerClient";
import { ProjectCertsManagerClient } from "./projects/[rkey]/certs/_components/ProjectCertsManagerClient";
import { SitesClient } from "./sites/_components/SitesClient";
import { SitesSkeleton } from "./sites/_components/SitesSkeleton";
import { AddDataClient } from "./add/_components/AddDataClient";
import { TreesPageClient } from "./trees/_components/TreesPageClient";
import { AudioClient } from "./audio/_components/AudioClient";
import { AudioSkeleton } from "./audio/_components/AudioSkeleton";
import { ObservationsClient } from "./observations/_components/ObservationsClient";
import { ManageBumicertsClient } from "./certs/_components/ManageBumicertsClient";
import { NewBumicertClient, type LinkedProjectPrefill } from "./certs/new/_components/NewBumicertClient";
import { MintCertProjectGate } from "./certs/new/_components/MintCertProjectGate";
import { DroneAppFrame } from "./drone/_components/DroneAppFrame";
import type { ManageTarget } from "@/lib/links";

export async function ManageHomeSection({ target, wrapDashboard = true }: { target: ManageTarget; wrapDashboard?: boolean }) {
  const account = await getAccountRouteData(target.did, target.identifier);
  const [receipts, projects, sites, trees, audio] = await Promise.all([
    fetchReceipts().catch(() => []),
    // Personal accounts own the same field data as organizations, so fetch the
    // counts for both account kinds.
    fetchProjectsByDid(target.did, 500).then((page) => page.records).catch(() => []),
    fetchLocationsByDid(target.did).catch(() => []),
    fetchTreeDatasetsByDid(target.did).catch(() => []),
    fetchAudioByDid(target.did).catch(() => []),
  ]);

  const donationCount = receipts.filter((receipt) =>
    account.kind === "organization"
      ? receipt.orgDid === target.did
      : receipt.from?.type === "did" && receipt.from.id === target.did,
  ).length;

  const overview = (
    <ManageOverview
      target={target}
      account={account}
      stats={{
        bumicerts: account.summary.bumicertCount,
        donations: donationCount,
        observations: account.summary.observationCount,
        projects: projects.length,
        sites: sites.length,
        trees: trees.length,
        audio: audio.length,
      }}
    />
  );

  if (!wrapDashboard) return overview;

  const groupRole: CgsRole | undefined = target.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;
  const session = await fetchAuthSession();

  return (
    <ManageDashboard
      account={account}
      basePath={target.basePath}
      writeRepoDid={target.kind === "group" ? target.did : undefined}
      groupRole={groupRole}
      currentUserDid={target.currentUserDid ?? (target.kind === "group" && session.isLoggedIn ? session.did : null)}
      recoveryEmail={session.isLoggedIn ? session.email ?? null : null}
    >
      {overview}
    </ManageDashboard>
  );
}

export function ProjectsSection({ target }: { target: ManageTarget }) {
  return (
    <Suspense fallback={<InlineCardGridSkeleton />}>
      <ManageProjectsClient target={target} />
    </Suspense>
  );
}

export function ProjectGallerySection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  return (
    <Suspense fallback={<InlineCardGridSkeleton cards={8} />}>
      <ProjectGalleryManagerClient target={target} projectRkey={projectRkey} />
    </Suspense>
  );
}

export function ProjectCertsSection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  return (
    <Suspense fallback={<InlineCardGridSkeleton cards={4} />}>
      <ProjectCertsManagerClient target={target} projectRkey={projectRkey} />
    </Suspense>
  );
}

async function fetchManagedProjectRef(
  did: string,
  rkey: string,
): Promise<{ atUri: string; cid: string | null; title: string } | null> {
  const projects = await fetchProjectsByDid(did, 500).then((page) => page.records).catch(() => []);
  const project = projects.find((entry) => entry.rkey === rkey) ?? null;
  if (!project) return null;
  return { atUri: project.atUri, cid: project.cid, title: project.title };
}

function ProjectManageBackLink({ target, label }: { target: ManageTarget; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`${profileBasePath(target)}/projects`}>
        <ArrowLeftIcon className="size-4" />
        {label}
      </Link>
    </Button>
  );
}

export async function ProjectTimelineSection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  const [manageT, project] = await Promise.all([
    getTranslations("common.projectManage"),
    fetchManagedProjectRef(target.did, projectRkey),
  ]);

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
        <ProjectManageBackLink target={target} label={manageT("backToProjects")} />
        <p className="mt-6 text-sm text-muted-foreground">{manageT("projectNotFound")}</p>
      </div>
    );
  }

  const [referenceT, timelineT, timelineEntryT, allEntries] = await Promise.all([
    getTranslations("bumicert.detail.reference"),
    getTranslations("bumicert.detail.timeline"),
    getTranslations("bumicert.detail.timelineEntry"),
    fetchTimelineAttachmentsByDid(target.did).catch(() => [] as TimelineAttachmentItem[]),
  ]);
  const entries = getEntriesForActivity(allEntries, project.atUri);
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

  const createPermission = canCreateRecord(target);
  const deletePermission = canDeleteRecord(target);
  const mutationRepo = target.kind === "group" ? target.did : undefined;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5">
        <ProjectManageBackLink target={target} label={manageT("backToProjects")} />
      </div>
      <div className="mb-4 max-w-3xl">
        <h1 className="font-instrument text-3xl font-light italic tracking-[-0.03em] text-foreground sm:text-4xl">{project.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{manageT("timelineDescription")}</p>
      </div>
      <BumicertTimeline
        organizationDid={target.did}
        activityUri={project.atUri}
        activityCid={project.cid ?? ""}
        bumicertTitle={project.title}
        canManageEvidence={createPermission.allowed || deletePermission.allowed}
        createPermission={createPermission}
        deletePermission={deletePermission}
        mutationRepo={mutationRepo}
        initialEntries={entries}
        sources={{ audio: [], occurrences: [], occurrencesIncomplete: false, treeGroups: [], places: [] }}
        references={references}
        attachmentsUnavailable={false}
      />
    </div>
  );
}

export function ProjectSitesSection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  return (
    <Suspense fallback={<SitesSkeleton />}>
      <ProjectSitesManagerClient target={target} projectRkey={projectRkey} />
    </Suspense>
  );
}

export function SitesSection({ target }: { target: ManageTarget }) {
  return <SitesClient target={target} did={target.did} />;
}

export function AddDataSection({ target }: { target: ManageTarget }) {
  return (
    <Suspense fallback={<InlineCardGridSkeleton cards={4} />}>
      <AddDataClient target={target} />
    </Suspense>
  );
}

export function TreesSection({ target }: { target: ManageTarget }) {
  return <TreesPageClient target={target} did={target.did} />;
}

export function AudioSection({ target }: { target: ManageTarget }) {
  return (
    <Suspense fallback={<AudioSkeleton />}>
      <AudioClient target={target} did={target.did} />
    </Suspense>
  );
}

export function DroneSection({ target }: { target: ManageTarget }) {
  const src = droneAppHref({ projectDid: target.did, view3d: false });
  return <DroneAppFrame src={src} title="GainForest drone viewer" organizationName={target.displayName} />;
}

export async function BumicertsSection({ target }: { target: ManageTarget }) {
  const account = await getAccountRouteData(target.did, target.identifier);
  try {
    const page = await fetchBumicertsByDid(target.did, 24);
    return <ManageBumicertsClient target={target} did={target.did} ownerIdentifier={account.urlIdentifier} bumicerts={page.records} />;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recent Certs.";
    return <ManageBumicertsClient target={target} did={target.did} ownerIdentifier={account.urlIdentifier} bumicerts={[]} error={message} />;
  }
}

export async function NewBumicertSection({ target, searchParams }: { target: ManageTarget; searchParams: { [key: string]: string | string[] | undefined } }) {
  const account = await getAccountRouteData(target.did, target.identifier);
  const linkedProject = await fetchLinkedProjectPrefill(target.did, projectParam(searchParams.forProject));

  // Certs are minted from a project. When no project is bound (and the steward
  // hasn't explicitly chosen to skip), show a project chooser first instead of
  // a blank Cert form.
  const skipProject = projectParam(searchParams.noProject) === "1";
  if (!linkedProject && !skipProject) {
    return <MintCertProjectGate target={target} />;
  }

  return (
    <NewBumicertClient
      target={target}
      did={target.did}
      ownerIdentifier={account.urlIdentifier}
      profile={{ name: account.displayName, avatarUrl: account.avatarUrl }}
      linkedProject={linkedProject}
    />
  );
}

export async function SettingsSection({ target }: { target: ManageTarget }) {
  const t = await getTranslations("upload.settings");
  if (target.kind === "group") {
    const role: CgsRole = target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member";
    let currentUserDid = target.currentUserDid ?? null;
    if (!currentUserDid) {
      const session = await fetchAuthSession();
      currentUserDid = session.isLoggedIn ? session.did : null;
    }
    return (
      <Container className="pt-4 pb-8">
        <div className="mb-6">
          <h1 className="font-instrument text-3xl font-light italic leading-tight tracking-[-0.02em] text-foreground">{t("organizationTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("organizationDescription")}</p>
        </div>
        <GroupMembers
          groupDid={target.did}
          currentRole={role}
          currentUserDid={currentUserDid}
          variant="section"
          showDataCouncil
        />
      </Container>
    );
  }

  // The username editor only makes sense for the signed-in user's own
  // account, so the current handle is resolved from the session here and
  // passed down; other (read-only) settings views omit it.
  const personalSession = await fetchAuthSession();
  const currentHandle = personalSession.isLoggedIn ? personalSession.handle : null;

  return (
    <Container className="pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium">{t("personalTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("personalDescription")}</p>
      </div>
      <AccountSettingsSections did={target.did} handle={currentHandle} />
    </Container>
  );
}

export async function ObservationsSection({
  target,
  forProject,
}: {
  target: ManageTarget;
  forProject?: string | null;
}) {
  // Observations are available to personal accounts and organizations alike,
  // so the steward can collect field data without first creating an org.
  // The indexer lags fresh writes, so read the newest records straight from
  // the owner's PDS as well — a sighting added moments ago still shows up.
  const [initialObservations, pdsLatest] = await Promise.all([
    walkOccurrences({
      media: "all",
      target: 24,
      after: null,
      ownerDid: target.did,
      resolveMedia: false,
    }).catch(() => ({ records: [], cursor: null, hasMore: false })),
    listLatestPdsRecords(target.did, "app.gainforest.dwc.occurrence", 24).catch(() => []),
  ]);
  const indexed = new Set(initialObservations.records.map((record) => record.id));
  const fresh = pdsLatest
    .map((item) => occurrenceFromPdsRecord(item))
    .filter((record): record is OccurrenceRecord => record !== null && !indexed.has(record.id));
  const initialPage = fresh.length
    ? {
        ...initialObservations,
        records: [...fresh, ...initialObservations.records].sort((a, b) =>
          (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
        ),
      }
    : initialObservations;
  return (
    <ObservationsClient
      target={target}
      initialPage={initialPage}
      forProject={forProject ?? null}
    />
  );
}

type PdsRecordResponse = {
  uri?: string;
  cid?: string;
  value?: Record<string, unknown>;
};

function projectParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function parseProjectParam(value: string | null): { did: string; rkey: string } | null {
  if (!value) return null;
  const decoded = decodeURIComponent(value);
  const separatorIndex = decoded.lastIndexOf("/");
  if (separatorIndex <= 0 || separatorIndex === decoded.length - 1) return null;
  return {
    did: decoded.slice(0, separatorIndex),
    rkey: decoded.slice(separatorIndex + 1),
  };
}

async function fetchLinkedProjectPrefill(targetDid: string, rawParam: string | null): Promise<LinkedProjectPrefill | null> {
  const parsed = parseProjectParam(rawParam);
  if (!parsed || parsed.rkey.includes("/")) return null;

  const host = await resolvePdsHost(parsed.did);
  if (!host) return null;
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: "org.hypercerts.collection",
    rkey: parsed.rkey,
  });
  const response = await fetch(`https://${host}/xrpc/com.atproto.repo.getRecord?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;

  const payload = (await response.json().catch(() => null)) as PdsRecordResponse | null;
  if (!payload?.uri || !payload.value) return null;
  const record = payload.value;
  if (stringValue(record.type)?.toLowerCase() !== "project") return null;
  const image = await projectImage(parsed.did, record);

  return {
    did: parsed.did,
    rkey: parsed.rkey,
    atUri: payload.uri,
    cid: typeof payload.cid === "string" ? payload.cid : null,
    title: stringValue(record.title) ?? "Untitled project",
    shortDescription: stringValue(record.shortDescription),
    description: descriptionText(record.description),
    imageUrl: image,
    locationUri: locationUri(record.location),
    rawRecord: record,
    canLink: parsed.did === targetDid,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function descriptionText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return null;
  const simpleValue = stringValue(value.value);
  if (simpleValue) return simpleValue;
  if (!Array.isArray(value.blocks)) return null;
  const text = value.blocks
    .map((entry) => {
      const block = isRecord(entry) && isRecord(entry.block) ? entry.block : null;
      return block ? stringValue(block.plaintext) : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n\n")
    .trim();
  return text || null;
}

function locationUri(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return stringValue(value.uri);
}

function extractBlobRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  if (typeof value.$link === "string") return value.$link;
  if (typeof value.ref === "string") return value.ref;
  if (isRecord(value.ref) && typeof value.ref.$link === "string") return value.ref.$link;
  return null;
}

async function imageUrlFromDef(did: string, value: unknown): Promise<string | null> {
  if (!isRecord(value)) return null;
  const uri = stringValue(value.uri);
  if (uri) return uri;
  const ref = extractBlobRef(value.image) ?? extractBlobRef(value.blob) ?? extractBlobRef(value.ref);
  return ref ? await resolveBlobUrl(did, ref, undefined).catch(() => null) : null;
}

async function projectImage(did: string, record: Record<string, unknown>): Promise<string | null> {
  return (await imageUrlFromDef(did, record.banner)) ?? (await imageUrlFromDef(did, record.avatar));
}
