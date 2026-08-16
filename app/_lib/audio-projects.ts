/**
 * Public projects with uploaded audio that have not yet published a
 * soundscape.
 *
 * Audio recordings live in an account's repo, while a project points at them
 * through an `org.hypercerts.context.attachment` on its timeline. The
 * attachment contains a sample of the recordings and the upload count in its
 * description. Reading that relationship, rather than treating every audio
 * owner as one project, keeps accounts with several projects attributed
 * correctly.
 */

import { cachedAsync } from "./async-cache";
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
};

type RawDeployment = {
  did?: string | null;
  uri?: string | null;
  name?: string | null;
  deviceModel?: string | null;
  siteRef?: string | null;
};

type AudioProjectUpload = {
  id: string;
  did: string;
  title: string | null;
  recordingCount: number;
  recorderName: string | null;
  siteName: string | null;
  createdAt: string | null;
};

/** A project card and the recorder folders that make up its upload. */
export type AudioProject = {
  project: ProjectRecord;
  /** The account that recorded it — the row's heading and logo. */
  organizationName: string | null;
  organizationAvatarUrl: string | null;
  recorderCount: number;
  recordingCount: number;
  uploads: AudioProjectUpload[];
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
        did uri name deploymentRef siteRef recordedBy
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

async function countByDeployment(
  deploymentRef: string,
  signal?: AbortSignal,
): Promise<number | null> {
  const data = await indexerQuery<{
    appGainforestAcAudio?: { totalCount?: number | null } | null;
  }>(
    `query AudioProjectDeploymentCount($deploymentRef: String!) {
      appGainforestAcAudio(
        first: 0
        where: { deploymentRef: { eq: $deploymentRef } }
      ) { totalCount }
    }`,
    { deploymentRef },
    signal,
  ).catch(() => null);
  const count = data?.appGainforestAcAudio?.totalCount;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
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

  const soundscapeProjectUris = new Set(
    visibleSoundscapeAttachments
      .map((attachment) => projectForAttachment(attachment, lookup))
      .filter((project): project is ProjectRecord => {
        if (!project) return false;
        return !hiddenDids.has(project.did) && !hiddenUris.has(project.atUri);
      })
      .map((project) => project.atUri),
  );

  const candidateUploads = visibleAudioAttachments.flatMap((attachment) => {
    const project = projectForAttachment(attachment, lookup);
    const recordings = audioUris(attachment).filter((uri) => !hiddenUris.has(uri));
    if (
      !project ||
      hiddenDids.has(project.did) ||
      hiddenUris.has(project.atUri) ||
      soundscapeProjectUris.has(project.atUri) ||
      recordings.length === 0
    ) return [];
    return [{ attachment, project, recordings }];
  });
  if (candidateUploads.length === 0) return [];

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

  const missingCounts = await Promise.all(
    uploadDrafts.map(async (draft) => {
      if (draft.parsedCount !== null || !draft.sample?.deploymentRef) return null;
      return countByDeployment(draft.sample.deploymentRef, signal);
    }),
  );

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

  const grouped = new Map<string, { project: ProjectRecord; uploads: AudioProjectUpload[] }>();
  uploadDrafts.forEach((draft, index) => {
    const { candidate, sample, sampleDid, deployment, parsedCount } = draft;
    const count = parsedCount ?? missingCounts[index] ?? candidate.recordings.length;
    if (count <= 0) return;
    const siteUri = sample?.siteRef ?? deployment?.siteRef ?? candidate.project.locationUri;
    const upload: AudioProjectUpload = {
      id: candidate.attachment.uri!,
      did: sampleDid,
      title: candidate.attachment.title?.trim() || null,
      recordingCount: count,
      recorderName: deployment?.name?.trim() || candidate.attachment.title?.trim() || deployment?.deviceModel?.trim() || null,
      siteName: siteUri ? locationNames.get(siteUri) ?? null : null,
      createdAt: candidate.attachment.createdAt ?? null,
    };
    const current = grouped.get(candidate.project.atUri);
    if (current) current.uploads.push(upload);
    else grouped.set(candidate.project.atUri, { project: candidate.project, uploads: [upload] });
  });

  // The row is headed by the account that recorded it, so resolve each one's
  // name and logo the same way every other account surface does.
  const projectDids = [...new Set([...grouped.values()].map(({ project }) => project.did))];
  const profileCards = await fetchIndexedCertifiedProfileCards(projectDids, signal).catch(
    () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
  );

  const projects = await Promise.all(
    [...grouped.values()].map(async ({ project, uploads }) => {
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
        recorderCount: uploads.length,
        recordingCount: uploads.reduce((sum, upload) => sum + upload.recordingCount, 0),
        uploads: [...uploads].sort((a, b) => {
          const left = a.createdAt ? Date.parse(a.createdAt) : 0;
          const right = b.createdAt ? Date.parse(b.createdAt) : 0;
          return right - left;
        }),
      };
    }),
  );

  return projects
    .filter((item) => item.recordingCount > 0)
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
