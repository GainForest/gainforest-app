/**
 * Public projects with audio evidence for the Audio explore page.
 *
 * Audio recordings and published soundscapes live in an account's repo, while
 * a project points at them through `org.hypercerts.context.attachment` records
 * on its timeline. The attachments contain recording samples and counts, so
 * this module keeps the project relationship intact while shaping both media
 * kinds into the same row-level data model.
 */

import { cachedAsync } from "./async-cache";
import { listAudioFolderTotals, type AudioFolderTotal } from "./audio-upload-days";
import {
  fetchHiddenRecordUris,
  fetchIndexedCertifiedProfileCards,
  fetchProjectsByDid,
  fetchPublicHiddenAccountDids,
  fetchRecordByUri,
  fetchTimelineLocationByUri,
  indexerQuery,
  type ProjectRecord,
} from "./indexer";
import { parseAtUri, resolveBlobUrl } from "./pds";

const AUDIO_PROJECTS_CACHE_KEY = "audio-projects:uploaded-without-soundscape";
const UNATTACHED_FOLDERS_CACHE_KEY = "audio-projects:unattached-folders";
const AUDIO_PROJECTS_CACHE_TTL_MS = 5 * 60_000;
const INDEXER_PAGE_SIZE = 1000;
const MAX_ATTACHMENT_PAGES = 50;
const AUDIO_SAMPLE_BATCH_SIZE = 40;

type AttachmentKind = "audio" | "soundscape";

type RawAttachment = {
  did?: string | null;
  uri?: string | null;
  createdAt?: string | null;
  title?: string | null;
  contentType?: string | null;
  subjects?: Array<{ uri?: string | null } | null> | null;
  description?: {
    __typename?: string | null;
    value?: string | null;
  } | string | null;
  content?: Array<{
    __typename?: string | null;
    uri?: string | null;
  } | null> | null;
};

type AttachmentConnection = {
  pageInfo?: { hasNextPage?: boolean | null; endCursor?: string | null } | null;
  edges?: Array<{ node?: RawAttachment | null } | null> | null;
};

type RawAudioSample = {
  did?: string | null;
  uri?: string | null;
  name?: string | null;
  deploymentRef?: string | null;
  siteRef?: string | null;
  recordedBy?: string | null;
  metadata?: { recordedAt?: string | null } | null;
};

type RawDeployment = {
  did?: string | null;
  uri?: string | null;
  name?: string | null;
  deviceModel?: string | null;
  siteRef?: string | null;
};

export type AudioProjectUpload = {
  id: string;
  did: string;
  /** The `ac.deployment` folder this slot stands for. One folder is one
   *  deployment, so this is the slot's identity and the key a soundscape is
   *  matched on. */
  deploymentRef: string | null;
  title: string | null;
  /** How many files the folder holds. */
  recordingCount: number;
  /** Folder name. Not shown — kept so search can find a project by it. */
  recorderName: string | null;
  siteName: string | null;
  createdAt: string | null;
  /** The sample of recording URIs carried by the timeline attachment. */
  recordingUris: string[];
  /** Distinct recording dates in this folder, earliest first. */
  recordedDates: string[];
};

/** One account's recorder folders that aren't attached to any project — the
 *  page's "(no project)" rows. Same slot shape as a project's uploads, so the
 *  gallery draws both with one component. */
export type UnattachedAudioAccount = {
  did: string;
  organizationName: string | null;
  organizationAvatarUrl: string | null;
  /** One upload per folder, newest first. */
  uploads: AudioProjectUpload[];
};

/** A project row and the recorder folders that make up its audio evidence. */
export type AudioProject = {
  project: ProjectRecord;
  /** The account that recorded it — the row's organization line and fallback logo. */
  organizationName: string | null;
  organizationAvatarUrl: string | null;
  /** Distinct recorder folders — one folder is one deployment. */
  recorderCount: number;
  recordingCount: number;
  uploads: AudioProjectUpload[];
  /** Published soundscape record URIs attached to this project. */
  soundscapeUris: string[];
};

function attachmentQuery(kind: AttachmentKind): string {
  return `query AudioProject${kind === "audio" ? "Uploads" : "Soundscapes"}($first: Int!, $after: String) {
    orgHypercertsContextAttachment(
      first: $first
      after: $after
      where: { contentType: { eq: "${kind}" } }
      sortBy: createdAt
      sortDirection: DESC
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          did uri createdAt title contentType
          subjects { uri }
          description {
            __typename
            ... on OrgHypercertsDefsDescriptionString { value }
          }
          content {
            __typename
            ... on OrgHypercertsDefsUri { uri }
          }
        }
      }
    }
  }`;
}

async function listAttachments(
  kind: AttachmentKind,
  signal?: AbortSignal,
): Promise<RawAttachment[]> {
  const all: RawAttachment[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_ATTACHMENT_PAGES; page += 1) {
    const data: { orgHypercertsContextAttachment?: AttachmentConnection } | null = await indexerQuery<{
      orgHypercertsContextAttachment?: AttachmentConnection;
    }>(attachmentQuery(kind), { first: INDEXER_PAGE_SIZE, after }, signal);
    const connection: AttachmentConnection | undefined = data?.orgHypercertsContextAttachment;
    all.push(
      ...(connection?.edges ?? [])
        .map((edge) => edge?.node)
        .filter((node): node is RawAttachment => Boolean(node?.uri)),
    );
    const pageInfo: AttachmentConnection["pageInfo"] = connection?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }

  return all;
}

function subjectUris(attachment: RawAttachment): string[] {
  return (attachment.subjects ?? []).flatMap((subject) =>
    typeof subject?.uri === "string" && subject.uri.startsWith("at://") ? [subject.uri] : [],
  );
}

function audioUris(attachment: RawAttachment): string[] {
  return (attachment.content ?? []).flatMap((item) => {
    if (!item?.uri || !item.uri.startsWith("at://")) return [];
    return parseAtUri(item.uri)?.collection === "app.gainforest.ac.audio" ? [item.uri] : [];
  });
}

function soundscapeUris(attachment: RawAttachment): string[] {
  return (attachment.content ?? []).flatMap((item) => {
    if (!item?.uri || !item.uri.startsWith("at://")) return [];
    return parseAtUri(item.uri)?.collection === "app.gainforest.ac.soundscape" ? [item.uri] : [];
  });
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct?.[1]) return direct[1];
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

function collectionSubject(attachment: RawAttachment): string | null {
  return subjectUris(attachment).find(
    (uri) => parseAtUri(uri)?.collection === "org.hypercerts.collection",
  ) ?? null;
}

function claimSubjects(attachment: RawAttachment): string[] {
  return subjectUris(attachment).filter(
    (uri) => parseAtUri(uri)?.collection === "org.hypercerts.claim.activity",
  );
}

function descriptionText(attachment: RawAttachment): string | null {
  const description = attachment.description;
  if (typeof description === "string") return description.trim() || null;
  if (!description || typeof description !== "object") return null;
  return typeof description.value === "string" ? description.value.trim() || null : null;
}

/** Extract the count written by the upload flow: "A recorder folder with 929 recordings." */
export function parseUploadedRecordingCount(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(?:^|\b)([\d,]+)\s+recordings?\b/i);
  if (!match?.[1]) return null;
  const count = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

async function resolveProjectLookup(
  attachments: RawAttachment[],
  signal?: AbortSignal,
): Promise<{
  byCollectionUri: Map<string, ProjectRecord>;
  byClaimUri: Map<string, ProjectRecord>;
}> {
  const collectionUris = new Set<string>();
  const claimsByDid = new Map<string, Set<string>>();

  for (const attachment of attachments) {
    const collection = collectionSubject(attachment);
    if (collection) collectionUris.add(collection);
    for (const claim of claimSubjects(attachment)) {
      const did = parseAtUri(claim)?.did;
      if (!did) continue;
      const claims = claimsByDid.get(did) ?? new Set<string>();
      claims.add(claim);
      claimsByDid.set(did, claims);
    }
  }

  const [directResults, claimResults] = await Promise.all([
    Promise.all(
      [...collectionUris].map(async (uri) =>
        fetchRecordByUri(uri, signal).catch(() => null),
      ),
    ),
    Promise.all(
      [...claimsByDid.entries()].map(async ([did, claims]) => {
        const page = await fetchProjectsByDid(did, INDEXER_PAGE_SIZE, null, signal).catch(() => null);
        if (!page) return [] as Array<{ claim: string; project: ProjectRecord }>;
        return page.records.flatMap((project) =>
          project.bumicertUris.flatMap((claim) =>
            claims.has(claim) ? [{ claim, project }] : [],
          ),
        );
      }),
    ),
  ]);

  const byCollectionUri = new Map<string, ProjectRecord>();
  for (const result of directResults) {
    if (result?.kind === "project") byCollectionUri.set(result.atUri, result);
  }

  const byClaimUri = new Map<string, ProjectRecord>();
  for (const result of claimResults.flat()) byClaimUri.set(result.claim, result.project);

  return { byCollectionUri, byClaimUri };
}

function projectForAttachment(
  attachment: RawAttachment,
  lookup: { byCollectionUri: Map<string, ProjectRecord>; byClaimUri: Map<string, ProjectRecord> },
): ProjectRecord | null {
  const collection = collectionSubject(attachment);
  if (collection) return lookup.byCollectionUri.get(collection) ?? null;
  for (const claim of claimSubjects(attachment)) {
    const project = lookup.byClaimUri.get(claim);
    if (project) return project;
  }
  return null;
}

async function fetchAudioSamples(
  uris: string[],
  signal?: AbortSignal,
): Promise<Map<string, RawAudioSample>> {
  const byUri = new Map<string, RawAudioSample>();
  const uniqueUris = [...new Set(uris)];

  for (let offset = 0; offset < uniqueUris.length; offset += AUDIO_SAMPLE_BATCH_SIZE) {
    const batch = uniqueUris.slice(offset, offset + AUDIO_SAMPLE_BATCH_SIZE);
    const selections = batch.map(
      (uri, index) => `a${index}: appGainforestAcAudioByUri(uri: ${JSON.stringify(uri)}) {
        did uri name deploymentRef siteRef recordedBy metadata { recordedAt }
      }`,
    );
    const data = await indexerQuery<Record<string, RawAudioSample | null>>(
      `query AudioProjectSamples {\n${selections.join("\n")}\n}`,
      {},
      signal,
    ).catch(() => null);
    if (!data) continue;
    batch.forEach((uri, index) => {
      const sample = data[`a${index}`];
      if (sample?.uri) byUri.set(uri, sample);
    });
  }

  return byUri;
}

async function fetchDeploymentsByDid(
  did: string,
  signal?: AbortSignal,
): Promise<Map<string, RawDeployment>> {
  const data = await indexerQuery<{
    appGainforestAcDeployment?: {
      edges?: Array<{ node?: RawDeployment | null } | null> | null;
    };
  }>(
    `query AudioProjectDeployments($did: String!) {
      appGainforestAcDeployment(
        first: ${INDEXER_PAGE_SIZE}
        where: { did: { eq: $did } }
        sortBy: createdAt
        sortDirection: DESC
      ) {
        edges { node { did uri name deviceModel siteRef } }
      }
    }`,
    { did },
    signal,
  ).catch(() => null);

  const deployments = new Map<string, RawDeployment>();
  for (const edge of data?.appGainforestAcDeployment?.edges ?? []) {
    const deployment = edge?.node;
    if (deployment?.uri) deployments.set(deployment.uri, deployment);
  }
  return deployments;
}

function maxCreatedAt(uploads: AudioProjectUpload[]): number {
  return Math.max(
    0,
    ...uploads.map((upload) => {
      const value = upload.createdAt ? Date.parse(upload.createdAt) : Number.NaN;
      return Number.isNaN(value) ? 0 : value;
    }),
  );
}

async function listNetworkAudioProjectsUncached(signal?: AbortSignal): Promise<AudioProject[]> {
  const [audioAttachments, soundscapeAttachments, hiddenDids, hiddenUris] = await Promise.all([
    listAttachments("audio", signal),
    listAttachments("soundscape", signal),
    fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>()),
    fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
  ]);

  const visibleAudioAttachments = audioAttachments.filter(
    (attachment) =>
      Boolean(attachment.did) &&
      Boolean(attachment.uri) &&
      !hiddenDids.has(attachment.did!) &&
      !hiddenUris.has(attachment.uri!),
  );
  const visibleSoundscapeAttachments = soundscapeAttachments.filter(
    (attachment) =>
      Boolean(attachment.did) &&
      Boolean(attachment.uri) &&
      !hiddenDids.has(attachment.did!) &&
      !hiddenUris.has(attachment.uri!),
  );

  const lookup = await resolveProjectLookup(
    [...visibleAudioAttachments, ...visibleSoundscapeAttachments],
    signal,
  );

  /** Keep the project relationship for published soundscapes as well as raw
   * uploads. A project can have both; hiding its uploads when it has a
   * soundscape was the source of the two different card shapes. */
  const soundscapesByProject = new Map<string, { project: ProjectRecord; uris: string[] }>();
  for (const attachment of visibleSoundscapeAttachments) {
    const project = projectForAttachment(attachment, lookup);
    const uris = soundscapeUris(attachment).filter((uri) => !hiddenUris.has(uri));
    if (
      !project ||
      hiddenDids.has(project.did) ||
      hiddenUris.has(project.atUri) ||
      uris.length === 0
    ) continue;
    const current = soundscapesByProject.get(project.atUri);
    if (current) current.uris.push(...uris);
    else soundscapesByProject.set(project.atUri, { project, uris });
  }

  const candidateUploads = visibleAudioAttachments.flatMap((attachment) => {
    const project = projectForAttachment(attachment, lookup);
    const recordings = audioUris(attachment).filter((uri) => !hiddenUris.has(uri));
    if (
      !project ||
      hiddenDids.has(project.did) ||
      hiddenUris.has(project.atUri) ||
      recordings.length === 0
    ) return [];
    return [{ attachment, project, recordings }];
  });
  if (candidateUploads.length === 0 && soundscapesByProject.size === 0) return [];

  const samples = await fetchAudioSamples(
    candidateUploads.map((candidate) => candidate.recordings[0]!),
    signal,
  );
  const deploymentDids = new Set<string>();
  for (const candidate of candidateUploads) {
    const sample = samples.get(candidate.recordings[0]!);
    const did = sample?.did ?? parseAtUri(candidate.recordings[0]!)?.did;
    if (did) deploymentDids.add(did);
  }
  const deploymentMaps = await Promise.all(
    [...deploymentDids].map(async (did) => [did, await fetchDeploymentsByDid(did, signal)] as const),
  );
  const deploymentsByDid = new Map(deploymentMaps);

  const uploadDrafts = candidateUploads.map((candidate) => {
    const sample = samples.get(candidate.recordings[0]!);
    const sampleDid = sample?.did ?? parseAtUri(candidate.recordings[0]!)?.did ?? candidate.project.did;
    const deployment = sample?.deploymentRef
      ? deploymentsByDid.get(sampleDid)?.get(sample.deploymentRef)
      : undefined;
    const parsedCount = parseUploadedRecordingCount(descriptionText(candidate.attachment));
    return {
      candidate,
      sample,
      sampleDid,
      deployment,
      parsedCount,
    };
  });

  // The folder's real size and its recording dates both come from the shared
  // sweep of the recordings. An attachment's note states a count too, but it
  // was written once, when the folder was attached, and says nothing about
  // what has been uploaded since — so it is only a fallback for a folder the
  // sweep can't resolve.
  const folderTotals = await listAudioFolderTotals(signal).catch(
    () => new Map<string, AudioFolderTotal>(),
  );
  const totalFor = (draft: { sample?: RawAudioSample }): AudioFolderTotal | undefined =>
    draft.sample?.deploymentRef ? folderTotals.get(draft.sample.deploymentRef) : undefined;

  const recordedDates = uploadDrafts.map((draft) => {
    const dates = totalFor(draft)?.recordedDates ?? [];
    if (dates.length > 0) return dates;
    const sampleDate = dateKey(draft.sample?.metadata?.recordedAt);
    return sampleDate ? [sampleDate] : [];
  });

  const locationUris = new Set<string>();
  for (const draft of uploadDrafts) {
    const siteRef = draft.sample?.siteRef ?? draft.deployment?.siteRef ?? draft.candidate.project.locationUri;
    if (siteRef) locationUris.add(siteRef);
  }
  const locationResults = await Promise.all(
    [...locationUris].map(async (uri) => [uri, await fetchTimelineLocationByUri(uri, signal).catch(() => null)] as const),
  );
  const locationNames = new Map(
    locationResults.flatMap(([uri, location]) =>
      location?.record.name ? [[uri, location.record.name] as const] : [],
    ),
  );

  // One folder is one deployment, so a folder gets exactly one slot even when
  // it was filled by several upload sessions. Keying by `deploymentRef` also
  // stops the folder total being added to the project total twice.
  const grouped = new Map<string, { project: ProjectRecord; uploads: Map<string, AudioProjectUpload> }>();
  for (const { project } of soundscapesByProject.values()) {
    grouped.set(project.atUri, { project, uploads: new Map() });
  }
  uploadDrafts.forEach((draft, index) => {
    const { candidate, sample, sampleDid, deployment, parsedCount } = draft;
    const count = totalFor(draft)?.recordingCount ?? parsedCount ?? candidate.recordings.length;
    if (count <= 0) return;
    const siteUri = sample?.siteRef ?? deployment?.siteRef ?? candidate.project.locationUri;
    const deploymentRef = sample?.deploymentRef?.trim() || null;
    const slotKey = deploymentRef ?? candidate.attachment.uri!;

    let entry = grouped.get(candidate.project.atUri);
    if (!entry) {
      entry = { project: candidate.project, uploads: new Map() };
      grouped.set(candidate.project.atUri, entry);
    }

    const existing = entry.uploads.get(slotKey);
    const createdAt = [candidate.attachment.createdAt ?? null, existing?.createdAt ?? null]
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? null;

    entry.uploads.set(slotKey, {
      id: existing?.id ?? candidate.attachment.uri!,
      did: sampleDid,
      deploymentRef,
      title: candidate.attachment.title?.trim() || existing?.title || null,
      // Every attachment for a folder reports that folder's total, so the
      // largest reading is the folder size — never the sum.
      recordingCount: Math.max(count, existing?.recordingCount ?? 0),
      recorderName:
        deployment?.name?.trim() ||
        candidate.attachment.title?.trim() ||
        deployment?.deviceModel?.trim() ||
        existing?.recorderName ||
        null,
      siteName: (siteUri ? locationNames.get(siteUri) ?? null : null) ?? existing?.siteName ?? null,
      createdAt,
      recordingUris: [...new Set([...(existing?.recordingUris ?? []), ...candidate.recordings])],
      recordedDates: [...new Set([...(existing?.recordedDates ?? []), ...(recordedDates[index] ?? [])])].sort(),
    });
  });

  // The row is headed by the account that recorded it, so resolve each one's
  // name and logo the same way every other account surface does.
  const projectDids = [...new Set([...grouped.values()].map(({ project }) => project.did))];
  const profileCards = await fetchIndexedCertifiedProfileCards(projectDids, signal).catch(
    () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
  );

  const projects = await Promise.all(
    [...grouped.values()].map(async ({ project, uploads: uploadsByFolder }) => {
      const uploads = [...uploadsByFolder.values()];
      const card = profileCards.get(project.did);
      const organizationAvatarUrl =
        card?.avatarUrl ??
        (project.creatorAvatarRef
          ? await resolveBlobUrl(project.did, project.creatorAvatarRef, signal).catch(() => null)
          : null);
      return {
        project,
        organizationName: card?.displayName ?? project.creatorName ?? null,
        organizationAvatarUrl,
        // One slot per folder, so the slot count is the recorder count.
        recorderCount: uploads.length,
        recordingCount: uploads.reduce((sum, upload) => sum + upload.recordingCount, 0),
        uploads: [...uploads].sort((a, b) => {
          const left = a.createdAt ? Date.parse(a.createdAt) : 0;
          const right = b.createdAt ? Date.parse(b.createdAt) : 0;
          return right - left;
        }),
        soundscapeUris: [...new Set(soundscapesByProject.get(project.atUri)?.uris ?? [])],
      };
    }),
  );

  return projects
    .filter((item) => item.recordingCount > 0 || item.soundscapeUris.length > 0)
    .sort((a, b) => maxCreatedAt(b.uploads) - maxCreatedAt(a.uploads));
}

/** Projects with public audio uploads, newest upload first. */
export async function listNetworkAudioProjects(signal?: AbortSignal): Promise<AudioProject[]> {
  return cachedAsync(
    AUDIO_PROJECTS_CACHE_KEY,
    AUDIO_PROJECTS_CACHE_TTL_MS,
    () => listNetworkAudioProjectsUncached(),
    signal,
  );
}

// ── Folders never attached to a project ─────────────────────────────
//
// Everything above starts from a project attachment, so a folder somebody
// uploaded into but never attached to a project is invisible to it. These
// folders are read the other way round — from the recordings themselves — and
// grouped per owner into "(no project)" rows. The recording count is counted
// live rather than parsed from an attachment note, since there is none.

/**
 * Turn folder totals into upload slots grouped per owner, dropping everything
 * already represented on the page or moderated away. Pure.
 *
 * Skipped on purpose:
 *  - folders in `attachedDeploymentRefs`: their project row shows them;
 *  - hidden folders and folders of hidden accounts.
 *
 * Recordings that sit in no folder never reach here — a slot stands for a
 * recorder folder, and the odd folder-less record can already surface as
 * project evidence.
 */
export function collectUnattachedFolders(input: {
  folderTotals: ReadonlyMap<string, AudioFolderTotal>;
  attachedDeploymentRefs: ReadonlySet<string>;
  hiddenDids: ReadonlySet<string>;
  hiddenRecordUris: ReadonlySet<string>;
}): Map<string, AudioProjectUpload[]> {
  const byOwner = new Map<string, AudioProjectUpload[]>();

  for (const [ref, total] of input.folderTotals) {
    if (input.attachedDeploymentRefs.has(ref) || input.hiddenRecordUris.has(ref)) continue;
    if (total.recordingCount <= 0) continue;
    const ownerDid = total.did || parseAtUri(ref)?.did || null;
    if (!ownerDid || input.hiddenDids.has(ownerDid)) continue;
    const uploads = byOwner.get(ownerDid) ?? [];
    uploads.push({
      id: ref,
      did: ownerDid,
      deploymentRef: ref,
      title: total.name,
      recordingCount: total.recordingCount,
      recorderName: total.name ?? total.deviceModel,
      siteName: null,
      createdAt: total.uploadedAt,
      recordingUris: [],
      recordedDates: total.recordedDates,
    });
    byOwner.set(ownerDid, uploads);
  }

  for (const uploads of byOwner.values()) {
    uploads.sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0;
      const right = b.createdAt ? Date.parse(b.createdAt) : 0;
      return right - left;
    });
  }
  return byOwner;
}

async function listUnattachedAudioAccountsUncached(
  signal?: AbortSignal,
): Promise<UnattachedAudioAccount[]> {
  const [attached, folderTotals, hiddenDids, hiddenUris] = await Promise.all([
    listNetworkAudioProjects(signal).catch(() => [] as AudioProject[]),
    listAudioFolderTotals(signal).catch(() => new Map<string, AudioFolderTotal>()),
    fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>()),
    fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
  ]);

  const attachedDeploymentRefs = new Set(
    attached.flatMap((project) =>
      project.uploads.flatMap((upload) => (upload.deploymentRef ? [upload.deploymentRef] : [])),
    ),
  );

  const byOwner = collectUnattachedFolders({
    folderTotals,
    attachedDeploymentRefs,
    hiddenDids,
    hiddenRecordUris: hiddenUris,
  });
  if (byOwner.size === 0) return [];

  // Site names for the search haystack — same lookup the attached slots use.
  const siteRefs = new Set<string>();
  for (const uploads of byOwner.values()) {
    for (const upload of uploads) {
      const siteRef = upload.deploymentRef ? folderTotals.get(upload.deploymentRef)?.siteRef : null;
      if (siteRef) siteRefs.add(siteRef);
    }
  }
  const locationResults = await Promise.all(
    [...siteRefs].map(async (uri) =>
      [uri, await fetchTimelineLocationByUri(uri, signal).catch(() => null)] as const,
    ),
  );
  const locationNames = new Map(
    locationResults.flatMap(([uri, location]) =>
      location?.record.name ? [[uri, location.record.name] as const] : [],
    ),
  );
  for (const uploads of byOwner.values()) {
    for (const upload of uploads) {
      const siteRef = upload.deploymentRef ? folderTotals.get(upload.deploymentRef)?.siteRef : null;
      if (siteRef) upload.siteName = locationNames.get(siteRef) ?? null;
    }
  }

  const profileCards = await fetchIndexedCertifiedProfileCards([...byOwner.keys()], signal).catch(
    () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
  );

  return [...byOwner.entries()]
    .map(([did, uploads]) => ({
      did,
      organizationName: profileCards.get(did)?.displayName ?? null,
      organizationAvatarUrl: profileCards.get(did)?.avatarUrl ?? null,
      uploads,
    }))
    .sort((a, b) => maxCreatedAt(b.uploads) - maxCreatedAt(a.uploads));
}

/** Accounts with recorder folders that aren't attached to any project, newest
 *  upload first — the Audio explore page's "(no project)" rows. */
export async function listUnattachedAudioAccounts(
  signal?: AbortSignal,
): Promise<UnattachedAudioAccount[]> {
  return cachedAsync(
    UNATTACHED_FOLDERS_CACHE_KEY,
    AUDIO_PROJECTS_CACHE_TTL_MS,
    () => listUnattachedAudioAccountsUncached(),
    signal,
  );
}
