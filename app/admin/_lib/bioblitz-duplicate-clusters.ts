/**
 * Automatic duplicate-observation detection for the BioBlitz admin dashboard.
 *
 * Participants sometimes upload many near-identical photos of the same
 * organism (e.g. a burst of 40 pictures of one snake), earning points for
 * each. This module clusters one collector's round observations into
 * likely-duplicate groups using cheap, metadata-only signals — plus the pairs
 * the offline CLIP/pHash image scanner already published as
 * `likely-duplicate` feed posts. Everything here is pure and synchronous so
 * it can be unit-tested without any network access.
 *
 * Signals (per collector):
 *   - identical-image: two observations reference the exact same image blob.
 *   - species-burst:   same species label, submitted in rapid succession.
 *   - filename-burst:  consecutive camera filenames (IMG_1044.jpg →
 *                      IMG_1045.jpg) submitted close together.
 *   - scanner:         the visual duplicate scanner flagged the pair.
 *
 * Detection only *suggests*: a steward reviews each cluster and decides
 * whether to merge it into one counting observation.
 */

export type BioblitzDuplicateSignal =
  | "identical-image"
  | "species-burst"
  | "filename-burst"
  | "scanner";

/** One image observation as the detector sees it (already round-filtered). */
export type DuplicateCandidateRecord = {
  uri: string;
  did: string;
  rkey: string;
  createdAt: string;
  /** Image blob CID, when known. */
  imageCid: string | null;
  /** Original upload filename, e.g. "IMG_1044.jpg". */
  associatedMedia: string | null;
  scientificName: string | null;
  vernacularName: string | null;
  /** Points this observation currently earns (0 when ineligible). */
  points: number;
};

export type DuplicateCluster = {
  /** The collector all clustered observations belong to. */
  did: string;
  /** Members sorted oldest-first; the first one is the suggested canonical. */
  records: DuplicateCandidateRecord[];
  /** Suggested observation to keep: the earliest submission. */
  canonicalUri: string;
  /** Why this cluster was flagged, strongest signal first. */
  signals: BioblitzDuplicateSignal[];
  /** Points the cluster earns today (sum of all members). */
  pointsBefore: number;
  /** Points after a merge (just the canonical member). */
  pointsAfter: number;
};

/** Same-species uploads chained within this gap form one burst. */
export const SPECIES_BURST_GAP_MS = 30 * 60 * 1000;
/** Consecutive-filename uploads chained within this gap form one burst. */
export const FILENAME_BURST_GAP_MS = 15 * 60 * 1000;
/** Filename numbers this close count as consecutive (IMG_1044 vs IMG_1046). */
export const FILENAME_BURST_MAX_STEP = 2;

const SIGNAL_ORDER: BioblitzDuplicateSignal[] = [
  "identical-image",
  "scanner",
  "species-burst",
  "filename-burst",
];

/** Placeholder labels that do not identify a species. */
const UNIDENTIFIED_LABEL = /^(?:unidentified|unknown|unidentifiable|n\/?a|none)\b/i;

/** Normalised species key, or null when the observation is unlabeled. Uses
 *  the scientific name when present so "Snake" vs the binomial still groups. */
export function speciesKey(record: {
  scientificName: string | null;
  vernacularName: string | null;
}): string | null {
  for (const value of [record.scientificName, record.vernacularName]) {
    const label = value?.trim().toLowerCase();
    if (label && !UNIDENTIFIED_LABEL.test(label)) return label.replace(/\s+/g, " ");
  }
  return null;
}

function filenameParts(name: string | null): { prefix: string; n: number } | null {
  if (!name) return null;
  const match = name.trim().match(/^(.*?)(\d+)\.[a-zA-Z0-9]+$/);
  return match ? { prefix: match[1]!.toLowerCase(), n: Number.parseInt(match[2]!, 10) } : null;
}

class UnionFind {
  private parent = new Map<string, string>();

  find(key: string): string {
    let root = this.parent.get(key) ?? key;
    while (root !== (this.parent.get(root) ?? root)) root = this.parent.get(root)!;
    // Path compression.
    let cursor = key;
    while (cursor !== root) {
      const next = this.parent.get(cursor) ?? root;
      this.parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function createdAtMs(record: DuplicateCandidateRecord): number {
  const ms = Date.parse(record.createdAt);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Cluster one round's eligible observations into likely-duplicate groups.
 *
 * `scannerPairs` are (uriA, uriB) pairs published by the offline image
 * scanner; pairs naming unknown or cross-collector URIs are ignored.
 * Only clusters with two or more members are returned, largest first.
 */
export function clusterDuplicateCandidates(
  records: readonly DuplicateCandidateRecord[],
  scannerPairs: readonly [string, string][] = [],
): DuplicateCluster[] {
  const byUri = new Map<string, DuplicateCandidateRecord>();
  for (const record of records) {
    if (!byUri.has(record.uri)) byUri.set(record.uri, record);
  }

  const unionFind = new UnionFind();
  const pairSignals = new Map<string, Set<BioblitzDuplicateSignal>>();
  const link = (a: string, b: string, signal: BioblitzDuplicateSignal) => {
    if (a === b) return;
    unionFind.union(a, b);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const signals = pairSignals.get(key) ?? new Set<BioblitzDuplicateSignal>();
    signals.add(signal);
    pairSignals.set(key, signals);
  };

  const byDid = new Map<string, DuplicateCandidateRecord[]>();
  for (const record of byUri.values()) {
    const list = byDid.get(record.did) ?? [];
    list.push(record);
    byDid.set(record.did, list);
  }

  for (const list of byDid.values()) {
    // Identical image blob → certain duplicate, regardless of timing.
    const byCid = new Map<string, DuplicateCandidateRecord[]>();
    for (const record of list) {
      if (!record.imageCid) continue;
      const group = byCid.get(record.imageCid) ?? [];
      group.push(record);
      byCid.set(record.imageCid, group);
    }
    for (const group of byCid.values()) {
      for (let i = 1; i < group.length; i++) link(group[0]!.uri, group[i]!.uri, "identical-image");
    }

    const sorted = [...list].sort((a, b) => createdAtMs(a) - createdAtMs(b));

    // Same species label, submitted in rapid succession. Chaining consecutive
    // submissions keeps a long burst (40 snake photos over 20 minutes) in a
    // single cluster while a genuinely separate later sighting starts a new one.
    const lastBySpecies = new Map<string, DuplicateCandidateRecord>();
    for (const record of sorted) {
      const key = speciesKey(record);
      if (!key) continue;
      const previous = lastBySpecies.get(key);
      if (previous && createdAtMs(record) - createdAtMs(previous) <= SPECIES_BURST_GAP_MS) {
        link(previous.uri, record.uri, "species-burst");
      }
      lastBySpecies.set(key, record);
    }

    // Consecutive camera filenames uploaded close together — catches bursts
    // whose species labels differ or are missing.
    const withNames = sorted
      .map((record) => ({ record, parts: filenameParts(record.associatedMedia) }))
      .filter((entry): entry is { record: DuplicateCandidateRecord; parts: { prefix: string; n: number } } =>
        entry.parts !== null,
      );
    for (let i = 0; i < withNames.length; i++) {
      for (let j = i + 1; j < withNames.length; j++) {
        const a = withNames[i]!;
        const b = withNames[j]!;
        const gap = Math.abs(createdAtMs(b.record) - createdAtMs(a.record));
        if (gap > FILENAME_BURST_GAP_MS) break;
        if (
          a.parts.prefix === b.parts.prefix &&
          Math.abs(a.parts.n - b.parts.n) <= FILENAME_BURST_MAX_STEP
        ) {
          link(a.record.uri, b.record.uri, "filename-burst");
        }
      }
    }
  }

  // Pairs the visual scanner published. Only same-collector pairs matter for
  // the points dashboard; cross-collector re-uploads are a moderation case.
  for (const [a, b] of scannerPairs) {
    const recordA = byUri.get(a);
    const recordB = byUri.get(b);
    if (recordA && recordB && recordA.did === recordB.did) link(a, b, "scanner");
  }

  // Materialise clusters of two or more observations.
  const members = new Map<string, DuplicateCandidateRecord[]>();
  for (const record of byUri.values()) {
    const root = unionFind.find(record.uri);
    const list = members.get(root) ?? [];
    list.push(record);
    members.set(root, list);
  }

  const clusters: DuplicateCluster[] = [];
  for (const list of members.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => createdAtMs(a) - createdAtMs(b) || a.uri.localeCompare(b.uri),
    );
    const uris = new Set(sorted.map((record) => record.uri));
    const signals = new Set<BioblitzDuplicateSignal>();
    for (const [key, pair] of pairSignals) {
      const [a, b] = key.split("|") as [string, string];
      if (uris.has(a) && uris.has(b)) for (const signal of pair) signals.add(signal);
    }
    const pointsBefore = sorted.reduce((sum, record) => sum + record.points, 0);
    // Keep the highest-scoring earliest observation: ties on points resolve to
    // the oldest, so a labeled shot is preferred over an unlabeled first shot.
    const canonical = [...sorted].sort(
      (a, b) => b.points - a.points || createdAtMs(a) - createdAtMs(b) || a.uri.localeCompare(b.uri),
    )[0]!;
    clusters.push({
      did: sorted[0]!.did,
      records: sorted,
      canonicalUri: canonical.uri,
      signals: SIGNAL_ORDER.filter((signal) => signals.has(signal)),
      pointsBefore: roundHalf(pointsBefore),
      pointsAfter: roundHalf(canonical.points),
    });
  }

  return clusters.sort(
    (a, b) =>
      b.records.length - a.records.length ||
      b.pointsBefore - a.pointsBefore ||
      a.canonicalUri.localeCompare(b.canonicalUri),
  );
}

/** Keep half-point scores exact after float summation. */
function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}
