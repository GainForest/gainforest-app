import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchReceipts } from "@/app/_lib/dashboard";
import {
  fetchAudioByDid,
  fetchBumicertsByDid,
  walkOccurrences,
  fetchLocationsByDid,
  fetchProjectsByDid,
  fetchTreeDatasetsByDid,
} from "@/app/_lib/indexer";
import { droneAppHref } from "@/app/_lib/urls";
import { resolveBlobUrl, resolvePdsHost } from "@/app/_lib/pds";
import { RecordExplorer } from "@/app/_components/RecordExplorer";
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
import { TreesPageClient } from "./trees/_components/TreesPageClient";
import { AudioClient } from "./audio/_components/AudioClient";
import { ObservationsClient } from "./observations/_components/ObservationsClient";
import { ManageBumicertsClient } from "./certs/_components/ManageBumicertsClient";
import { NewBumicertClient, type LinkedProjectPrefill } from "./certs/new/_components/NewBumicertClient";
import { DroneAppFrame } from "./drone/_components/DroneAppFrame";
import type { ManageTarget } from "@/lib/links";

export async function ManageHomeSection({ target, wrapDashboard = true }: { target: ManageTarget; wrapDashboard?: boolean }) {
  const account = await getAccountRouteData(target.did, target.identifier);
  const [receipts, projects, sites, trees, audio] = await Promise.all([
    fetchReceipts().catch(() => []),
    account.kind === "organization" ? fetchProjectsByDid(target.did, 500).then((page) => page.records).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchLocationsByDid(target.did).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchTreeDatasetsByDid(target.did).catch(() => []) : Promise.resolve([]),
    account.kind === "organization" ? fetchAudioByDid(target.did).catch(() => []) : Promise.resolve([]),
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
    <Suspense fallback={null}>
      <ManageProjectsClient target={target} />
    </Suspense>
  );
}

export function ProjectGallerySection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  return (
    <Suspense fallback={null}>
      <ProjectGalleryManagerClient target={target} projectRkey={projectRkey} />
    </Suspense>
  );
}

export function ProjectCertsSection({ target, projectRkey }: { target: ManageTarget; projectRkey: string }) {
  return (
    <Suspense fallback={null}>
      <ProjectCertsManagerClient target={target} projectRkey={projectRkey} />
    </Suspense>
  );
}

export function SitesSection({ target }: { target: ManageTarget }) {
  return <SitesClient target={target} did={target.did} />;
}

export function TreesSection({ target }: { target: ManageTarget }) {
  return <TreesPageClient target={target} did={target.did} />;
}

export function AudioSection({ target }: { target: ManageTarget }) {
  return (
    <Suspense fallback={null}>
      <AudioClient target={target} did={target.did} />
    </Suspense>
  );
}

export function DroneSection({ target }: { target: ManageTarget }) {
  if (target.accountKind !== "organization") {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-12">
        <section className="max-w-xl rounded-3xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Drone viewer</p>
          <h1 className="mt-3 font-instrument text-3xl font-light italic tracking-[-0.02em] text-foreground">
            Select an organization to view drone evidence
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Drone layers are attached to organization accounts. Choose an organization you manage to open its drone workspace.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/manage/organizations" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              View my organizations
            </Link>
          </div>
        </section>
      </Container>
    );
  }

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

  return (
    <Container className="pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium">{t("personalTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("personalDescription")}</p>
      </div>
      <AccountSettingsSections did={target.did} />
    </Container>
  );
}

export async function ObservationsSection({ target }: { target: ManageTarget }) {
  if (target.accountKind !== "organization") notFound();
  const initialObservations = await walkOccurrences({
    media: "all",
    target: 24,
    after: null,
    ownerDid: target.did,
    resolveMedia: false,
  }).catch(() => ({ records: [], cursor: null, hasMore: false }));
  return <ObservationsClient target={target} initialPage={initialObservations} />;
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
