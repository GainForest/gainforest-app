/**
 * Network-wide discovery of published soundscapes for the Audio explore page.
 *
 * The indexer does not (yet) index `app.gainforest.ac.soundscape`, but every
 * soundscape is published into a repo that also holds the `ac.audio`
 * recordings it was built from — the workbench reads and writes one acting
 * repo. So discovery goes sideways: collect the distinct owners of indexed
 * audio records and recording folders, keep the repos that actually carry the
 * soundscape collection, and list each one's newest published soundscapes
 * straight from its PDS (public reads, same trust model as the permalink
 * page). Moderation applies like every other public catalog: flagged/blocked
 * accounts and flagged records are left out.
 */

import { cachedAsync } from "./async-cache";
import { fetchHiddenRecordUris, fetchPublicHiddenAccountDids, indexerQuery } from "./indexer";
import { listLatestPdsRecords, parseAtUri } from "./pds";
import { hasPublishedSoundscapes } from "./soundscape-record";
import { INDEXER_URL } from "./urls";
import {
  parseSoundscapeRecord,
  SOUNDSCAPE_COLLECTION,
  type PublishedSoundscape,
} from "@/lib/soundscape/record";

/** One published soundscape found on the network, ready to draw. */
export type NetworkSoundscape = {
  uri: string;
  did: string;
  rkey: string;
  soundscape: PublishedSoundscape;
  /** Best-effort recorder/folder name for projects without a raw upload slot. */
  recorderName?: string | null;
};

/** The gallery shows the newest few; a soundscape record can run to a few
 *  hundred kilobytes of band values, so the page must not ship dozens. */
const MAX_NETWORK_SOUNDSCAPES = 24;

/** Per-publisher listing depth (mirrors SOUNDSCAPE_LIST_LIMIT's reasoning). */
const PER_PUBLISHER_LIMIT = 12;

/** How many indexer pages of audio records to walk collecting owner DIDs.
 *  Each page holds up to 1000 records; the audio catalog is a few thousand
 *  records across a handful of accounts, so this is generous headroom. */
const MAX_DISCOVERY_PAGES = 6;

const CACHE_KEY = "soundscape-explore:network";
const CACHE_TTL_MS = 5 * 60_000;

type DidPage = {
  edges: Array<{ node: { did: string } | null } | null>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

async function queryIndexerDids(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, DidPage> | null> {
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { data?: Record<string, DidPage> } | null;
  return body?.data ?? null;
}

/** Distinct owners of indexed `ac.audio` records and `ac.deployment` folders —
 *  the candidate soundscape publishers. */
async function collectAudioOwnerDids(signal?: AbortSignal): Promise<Set<string>> {
  const dids = new Set<string>();
  const add = (page: DidPage | undefined) => {
    for (const edge of page?.edges ?? []) {
      const did = edge?.node?.did;
      if (did) dids.add(did);
    }
    return page?.pageInfo;
  };

  let cursor: string | null = null;
  for (let page = 0; page < MAX_DISCOVERY_PAGES; page += 1) {
    const data = await queryIndexerDids(
      `query AudioOwners($after: String) {
        appGainforestAcAudio(first: 1000, after: $after) {
          edges { node { did } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor },
      signal,
    );
    const info = add(data?.appGainforestAcAudio);
    if (!info?.hasNextPage || !info.endCursor) break;
    cursor = info.endCursor;
  }

  const deployments = await queryIndexerDids(
    `query DeploymentOwners {
      appGainforestAcDeployment(first: 1000) {
        edges { node { did } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {},
    signal,
  );
  add(deployments?.appGainforestAcDeployment);

  return dids;
}

type SoundscapeAudioRef = { deploymentRef?: string | null } | null;
type SoundscapeDeployment = { name?: string | null; deviceModel?: string | null } | null;

/** Resolve one recorder label per published soundscape. Raw upload attachments
 * are not guaranteed to exist for every project, but a soundscape still points
 * at its source audio record, which points at the deployment folder. */
async function addRecorderNames(
  items: NetworkSoundscape[],
  signal?: AbortSignal,
): Promise<NetworkSoundscape[]> {
  const sources = items.map((item) => item.soundscape.sources[0]?.audioUri ?? null);
  const audioSelections = sources.flatMap((uri, index) =>
    uri ? [`a${index}: appGainforestAcAudioByUri(uri: ${JSON.stringify(uri)}) { deploymentRef }`] : [],
  );
  if (audioSelections.length === 0) return items;

  const audioData = await indexerQuery<Record<string, SoundscapeAudioRef>>(
    `query SoundscapeRecorderAudio {\n${audioSelections.join("\n")}\n}`,
    {},
    signal,
  ).catch(() => null);
  if (!audioData) return items;

  const deploymentRefs = sources.map((_, index) => audioData[`a${index}`]?.deploymentRef ?? null);
  const deploymentSelections = deploymentRefs.flatMap((uri, index) =>
    uri
      ? [`d${index}: appGainforestAcDeploymentByUri(uri: ${JSON.stringify(uri)}) { name deviceModel }`]
      : [],
  );
  if (deploymentSelections.length === 0) return items;

  const deploymentData = await indexerQuery<Record<string, SoundscapeDeployment>>(
    `query SoundscapeRecorderDeployments {\n${deploymentSelections.join("\n")}\n}`,
    {},
    signal,
  ).catch(() => null);
  if (!deploymentData) return items;

  return items.map((item, index) => {
    const deployment = deploymentData[`d${index}`];
    const recorderName = deployment?.name?.trim() || deployment?.deviceModel?.trim() || null;
    return recorderName ? { ...item, recorderName } : item;
  });
}

async function listNetworkSoundscapesUncached(signal?: AbortSignal): Promise<NetworkSoundscape[]> {
  const [candidates, hiddenDids, hiddenUris] = await Promise.all([
    collectAudioOwnerDids(signal),
    fetchPublicHiddenAccountDids(signal).catch(() => new Set<string>()),
    fetchHiddenRecordUris(signal).catch(() => new Set<string>()),
  ]);

  const publishers = [...candidates].filter((did) => !hiddenDids.has(did));

  const perPublisher = await Promise.all(
    publishers.map(async (did): Promise<NetworkSoundscape[]> => {
      try {
        if (!(await hasPublishedSoundscapes(did, signal))) return [];
        const records = await listLatestPdsRecords(did, SOUNDSCAPE_COLLECTION, PER_PUBLISHER_LIMIT, signal);
        return records.flatMap((record) => {
          if (hiddenUris.has(record.uri)) return [];
          const parts = parseAtUri(record.uri);
          const soundscape = parseSoundscapeRecord(record.value);
          if (!parts || !soundscape) return [];
          return [{ uri: record.uri, did: parts.did, rkey: parts.rkey, soundscape }];
        });
      } catch {
        // One unreachable PDS must not empty the whole gallery.
        return [];
      }
    }),
  );

  const publishedAt = (item: NetworkSoundscape): number => {
    const time = Date.parse(item.soundscape.createdAt ?? "");
    return Number.isNaN(time) ? 0 : time;
  };

  const published = perPublisher
    .flat()
    .sort((a, b) => publishedAt(b) - publishedAt(a))
    .slice(0, MAX_NETWORK_SOUNDSCAPES);

  return addRecorderNames(published, signal);
}

/** Every published soundscape on the network, newest first (cached briefly —
 *  the gallery is a public explore surface, not a live feed). */
export async function listNetworkSoundscapes(signal?: AbortSignal): Promise<NetworkSoundscape[]> {
  return cachedAsync(CACHE_KEY, CACHE_TTL_MS, () => listNetworkSoundscapesUncached(), signal);
}
