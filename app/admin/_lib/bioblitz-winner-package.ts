import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { BlobWriter, TextReader, Uint8ArrayReader, ZipWriter, configure } from "@zip.js/zip.js";
import {
  bioblitzRoundUsesPoints,
  endedRounds,
  fetchRoundCollectors,
  type BioblitzRound,
} from "@/app/_lib/bioblitz";
import {
  fetchHiddenRecordUris,
  fetchOccurrenceByUri,
  fetchPublicHiddenAccountDids,
  walkOccurrences,
  type OccurrenceRecord,
} from "@/app/_lib/indexer";
import { fetchEngagement } from "@/app/_lib/feed-engagement";
import { classifyBioblitzImage, isEligibleBioblitzCategory } from "@/app/_lib/bioblitz-eligibility";
import { normaliseRef, resolvePdsHost } from "@/app/_lib/pds";
import { loadBioblitzConfirmedWinners } from "./bioblitz-confirmed-winners";
import type { BioblitzWinnerPrize } from "./bioblitz-dashboard-types";

const ZIP_OPTIONS = { useWebWorkers: false } as const;
const MAX_EXPORT_OBSERVATIONS = 10;
const MAX_OBSERVATION_SCAN = 1_000;
const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 80 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class BioblitzWinnerPackageError extends Error {
  constructor(
    readonly code: "round_not_found" | "winner_not_found" | "package_failed",
    readonly status: number,
  ) {
    super(code);
    this.name = "BioblitzWinnerPackageError";
  }
}

type Winner = {
  did: string;
  displayName: string | null;
  avatarRef: string | null;
  observationCount: number;
  winningObservationUri: string | null;
  winningLikeCount: number | null;
};

type RankedObservation = {
  record: OccurrenceRecord;
  likeCount: number;
};

type DownloadedAsset = {
  bytes: Uint8Array;
  extension: string;
};

type IncludedObservation = RankedObservation & {
  filename: string;
};

type PinnedPdsTarget = {
  url: URL;
  hostname: string;
  address: string;
  family: 4 | 6;
};

export type BioblitzWinnerPackage = {
  filename: string;
  body: Blob;
};

export function winnerPackageFolderName(roundId: number, prize: BioblitzWinnerPrize): string {
  const category = boardPrizeName(roundId, prize);
  return `Round ${roundId} ${category} Winner`;
}

/** The board prize's name under the rule its round was played with. */
function boardPrizeName(roundId: number, prize: BioblitzWinnerPrize): string {
  if (prize === "best-picture") return "Best Picture";
  return bioblitzRoundUsesPoints(roundId) ? "Highest Points" : "Most Observations";
}

export function winnerPackageFilename(roundId: number, prize: BioblitzWinnerPrize): string {
  return `${winnerPackageFolderName(roundId, prize)}.zip`;
}

export function extensionForImageContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  return EXTENSION_BY_CONTENT_TYPE[contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""] ?? null;
}

/**
 * Assemble a marketing hand-off package from a finished round's confirmed
 * winner. The recipient and winning image reference come only from a steward
 * decision or already-issued recognition badge, never from current likes or
 * the request body.
 */
export async function createBioblitzWinnerPackage(
  roundId: number,
  prize: BioblitzWinnerPrize,
  badgeRepoDid: string | null,
): Promise<BioblitzWinnerPackage> {
  const round = endedRounds().find((candidate) => candidate.id === roundId);
  if (!round) throw new BioblitzWinnerPackageError("round_not_found", 404);

  const winner = await resolveWinner(round, prize, badgeRepoDid);
  if (!winner) throw new BioblitzWinnerPackageError("winner_not_found", 409);

  const ranked = await selectWinnerObservations(round, winner, prize);
  if (prize === "best-picture") {
    const confirmedPicture = ranked.find((item) => item.record.atUri === winner.winningObservationUri) ?? null;
    winner.winningLikeCount = confirmedPicture?.likeCount ?? null;
  }
  const pdsTarget = await resolvePinnedPdsTarget(winner.did).catch(() => null);

  try {
    configure(ZIP_OPTIONS);
    const rootFolder = winnerPackageFolderName(round.id, prize);
    const writer = new ZipWriter(new BlobWriter("application/zip"), ZIP_OPTIONS);
    const included: IncludedObservation[] = [];
    const skipped: string[] = [];
    let totalBytes = 0;
    let profileFilename: string | null = null;

    const profile = await fetchPdsImage(pdsTarget, winner.did, winner.avatarRef, MAX_ASSET_BYTES);
    if (profile && profile.bytes.byteLength <= MAX_TOTAL_ASSET_BYTES) {
      profileFilename = `profile.${profile.extension}`;
      await writer.add(`${rootFolder}/${profileFilename}`, new Uint8ArrayReader(profile.bytes), ZIP_OPTIONS);
      totalBytes += profile.bytes.byteLength;
    }

    for (const rankedObservation of ranked) {
      const remainingBytes = MAX_TOTAL_ASSET_BYTES - totalBytes;
      if (remainingBytes <= 0) {
        skipped.push(observationLabel(rankedObservation.record));
        continue;
      }
      const asset = await fetchPdsImage(
        pdsTarget,
        rankedObservation.record.did,
        rankedObservation.record.imageRef,
        Math.min(MAX_ASSET_BYTES, remainingBytes),
      );
      if (!asset) {
        skipped.push(observationLabel(rankedObservation.record));
        continue;
      }

      const filename = `observations/${String(included.length + 1).padStart(2, "0")}.${asset.extension}`;
      await writer.add(`${rootFolder}/${filename}`, new Uint8ArrayReader(asset.bytes), ZIP_OPTIONS);
      totalBytes += asset.bytes.byteLength;
      included.push({ ...rankedObservation, filename });
    }

    const info = buildWinnerInfoMarkdown({
      round,
      prize,
      winner,
      profileFilename,
      observations: included,
      skipped,
    });
    await writer.add(`${rootFolder}/info.md`, new TextReader(info), ZIP_OPTIONS);
    return {
      filename: winnerPackageFilename(round.id, prize),
      body: (await writer.close()) as Blob,
    };
  } catch (error) {
    console.error("[admin-bioblitz] winner package failed", error);
    throw new BioblitzWinnerPackageError("package_failed", 502);
  }
}

async function resolveWinner(
  round: BioblitzRound,
  prize: BioblitzWinnerPrize,
  badgeRepoDid: string | null,
): Promise<Winner | null> {
  const confirmed = await loadBioblitzConfirmedWinners(round, badgeRepoDid);
  const winner = confirmed[prize];
  if (!winner || (prize === "best-picture" && !winner.winningObservationUri)) return null;

  const board = await fetchRoundCollectors(round, "round", undefined, "required", { includeExcluded: true });
  const collector = (board.unfilteredCollectors ?? board.collectors).find((entry) => entry.did === winner.did) ?? null;
  return {
    did: winner.did,
    displayName: collector?.displayName ?? null,
    avatarRef: collector?.avatarRef ?? null,
    observationCount: winner.count ?? collector?.count ?? 0,
    winningObservationUri: winner.winningObservationUri ?? null,
    winningLikeCount: null,
  };
}

async function selectWinnerObservations(
  round: BioblitzRound,
  winner: Winner,
  prize: BioblitzWinnerPrize,
): Promise<RankedObservation[]> {
  const [{ records }, confirmedPicture, hiddenAccounts, hiddenRecords] = await Promise.all([
    walkOccurrences({
      media: "image",
      target: MAX_OBSERVATION_SCAN,
      after: null,
      ownerDid: winner.did,
      resolveMedia: false,
      featuredBadgesOnly: false,
      createdAt: { gte: round.start, lte: round.end },
    }),
    prize === "best-picture" && winner.winningObservationUri
      ? fetchOccurrenceByUri(winner.winningObservationUri).catch(() => null)
      : Promise.resolve(null),
    fetchPublicHiddenAccountDids().catch(() => new Set<string>()),
    fetchHiddenRecordUris().catch(() => new Set<string>()),
  ]);
  if (hiddenAccounts.has(winner.did)) {
    if (prize === "best-picture") throw new BioblitzWinnerPackageError("winner_not_found", 409);
    return [];
  }

  const candidates = new Map(records.map((record) => [record.atUri, record]));
  if (confirmedPicture) candidates.set(confirmedPicture.atUri, confirmedPicture);
  const eligible = [...candidates.values()].filter((record) => isEligibleWinnerObservation(record, round, winner.did, hiddenRecords));
  if (prize === "best-picture" && !eligible.some((record) => record.atUri === winner.winningObservationUri)) {
    throw new BioblitzWinnerPackageError("winner_not_found", 409);
  }
  const engagement = await fetchEngagement(eligible.map((record) => record.atUri), null);

  return eligible
    .map((record) => ({ record, likeCount: engagement.get(record.atUri)?.likeCount ?? 0 }))
    .sort((a, b) => {
      const confirmedDifference = Number(b.record.atUri === winner.winningObservationUri) - Number(a.record.atUri === winner.winningObservationUri);
      if (prize === "best-picture" && confirmedDifference) return confirmedDifference;
      return b.likeCount - a.likeCount || Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt);
    })
    .slice(0, MAX_EXPORT_OBSERVATIONS);
}

function isEligibleWinnerObservation(
  record: OccurrenceRecord,
  round: BioblitzRound,
  winnerDid: string,
  hiddenRecords: Set<string>,
): boolean {
  const createdAt = Date.parse(record.createdAt);
  if (
    record.did !== winnerDid
    || hiddenRecords.has(record.atUri)
    || !record.imageRef
    || !Number.isFinite(createdAt)
    || createdAt < Date.parse(round.start)
    || createdAt > Date.parse(round.end)
  ) return false;
  return isEligibleBioblitzCategory(
    classifyBioblitzImage({
      notes: record.remarks,
      scientificName: record.scientificName,
      vernacularName: record.vernacularName,
      kingdom: record.kingdom,
    }),
  );
}

async function resolvePinnedPdsTarget(did: string): Promise<PinnedPdsTarget | null> {
  const host = await resolvePdsHost(did);
  return host ? resolvePublicPdsTarget(host) : null;
}

async function resolvePublicPdsTarget(host: string): Promise<PinnedPdsTarget | null> {
  let url: URL;
  let hostname: string;
  try {
    url = new URL(`https://${host}`);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    hostname = url.hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }

  const family = isIP(hostname);
  if (family === 4 || family === 6) {
    return isPublicAddress(hostname)
      ? { url, hostname, address: hostname, family }
      : null;
  }

  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (records.length === 0 || !records.every((record) => isPublicAddress(record.address))) return null;
  const target = records[0]!;
  return { url, hostname, address: target.address, family: target.family as 4 | 6 };
}

async function fetchPdsImage(
  target: PinnedPdsTarget | null,
  did: string,
  ref: string | null,
  maxBytes: number,
): Promise<DownloadedAsset | null> {
  const cid = normaliseRef(ref);
  if (!cid || !target || maxBytes <= 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await requestPinnedBlob(target, did, cid, controller.signal);
    if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
      response.resume();
      return null;
    }
    const extension = extensionForImageContentType(headerValue(response, "content-type"));
    if (!extension) {
      response.resume();
      return null;
    }
    const bytes = await readIncomingMessageWithinLimit(response, maxBytes);
    return bytes ? { bytes, extension } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pin a Node HTTPS lookup to one address that already passed the public-IP
 * check. Node's auto-family selection requests `{ all: true }`, which needs
 * an address-list callback even though we deliberately return just one target.
 */
export function createPinnedPdsLookup(
  address: string,
  family: 4 | 6,
): NonNullable<RequestOptions["lookup"]> {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

function requestPinnedBlob(
  target: PinnedPdsTarget,
  did: string,
  cid: string,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const url = new URL("/xrpc/com.atproto.sync.getBlob", target.url);
  url.searchParams.set("did", did);
  url.searchParams.set("cid", cid);
  const lookup = createPinnedPdsLookup(target.address, target.family);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isIP(target.hostname) ? undefined : target.hostname,
        lookup,
        signal,
        headers: { accept: "image/avif,image/gif,image/heic,image/heif,image/jpeg,image/png,image/webp" },
      },
      resolve,
    );
    request.once("error", reject);
    request.end();
  });
}

function headerValue(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function readIncomingMessageWithinLimit(message: IncomingMessage, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = Number(headerValue(message, "content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    message.resume();
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const finish = (value: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    message.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        message.destroy();
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    message.once("error", () => finish(null));
    message.once("aborted", () => finish(null));
    message.once("end", () => {
      if (settled) return;
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      finish(bytes);
    });
  });
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first, second] = address.split(".").map(Number);
    if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
    if (first === 100 && second >= 64 && second <= 127) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && (second === 0 || second === 168)) return false;
    if (first === 198 && (second === 18 || second === 19)) return false;
    return true;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const groups = ipv6Groups(normalized);
    const embeddedIpv4 = groups ? embeddedIpv4Address(groups) : null;
    if (embeddedIpv4) return isPublicAddress(embeddedIpv4);
    if (groups && groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false;
    if (normalized === "::") return false;
    // Only global-unicast 2000::/3 addresses are valid PDS targets. This
    // rejects multicast, link/site-local, unique-local, documentation, and
    // other special-use IPv6 ranges before a socket is opened.
    if (!groups || (groups[0]! & 0xe000) !== 0x2000) return false;
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
    if (groups[0] === 0x2002) return false; // 6to4 embeds an IPv4 destination
    return true;
  }
  return false;
}

function ipv6Groups(address: string): number[] | null {
  const dottedTail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(address)?.[1] ?? null;
  let normalized = address;
  if (dottedTail) {
    if (isIP(dottedTail) !== 4) return null;
    const bytes = dottedTail.split(".").map(Number);
    normalized = `${address.slice(0, -dottedTail.length)}${((bytes[0]! << 8) | bytes[1]!).toString(16)}:${((bytes[2]! << 8) | bytes[3]!).toString(16)}`;
  }

  const pieces = normalized.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((pieces.length === 1 && missing !== 0) || (pieces.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array<string>(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function embeddedIpv4Address(groups: number[]): string | null {
  const ipv4Compatible = groups.slice(0, 6).every((group) => group === 0);
  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (!ipv4Compatible && !ipv4Mapped) return null;
  const high = groups[6]!;
  const low = groups[7]!;
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

export function buildWinnerInfoMarkdown({
  round,
  prize,
  winner,
  profileFilename,
  observations,
  skipped,
}: {
  round: Pick<BioblitzRound, "id" | "start" | "end">;
  prize: BioblitzWinnerPrize;
  winner: Pick<Winner, "displayName" | "observationCount" | "winningLikeCount"> & {
    winningObservationUri?: string | null;
  };
  profileFilename: string | null;
  observations: Array<Pick<IncludedObservation, "record" | "likeCount" | "filename">>;
  skipped: string[];
}): string {
  const category = boardPrizeName(round.id, prize);
  const winnerName = winner.displayName?.trim() || "Unnamed account";
  const performance = prize === "most-observations"
    ? `${bioblitzRoundUsesPoints(round.id) ? "Final score" : "Eligible observations"}: ${winner.observationCount}`
    : `Likes on winning picture: ${winner.winningLikeCount ?? "Not available"}`;
  const lines = [
    `# Round ${round.id} ${category} Winner`,
    "",
    `Winner: ${winnerName}`,
    `Round: ${round.start.slice(0, 10)} – ${round.end.slice(0, 10)}`,
    `Prize: ${category}`,
    performance,
    `Profile image: ${profileFilename ?? "Not available"}`,
    "",
    "## Included observations",
    "",
  ];

  if (observations.length === 0) {
    lines.push("No observation image could be included.");
  } else {
    lines.push("| File | Taxon | Uploaded | Location | Likes | Notes |", "| --- | --- | --- | --- | ---: | --- |");
    for (const observation of observations) {
      const record = observation.record;
      lines.push(
        `| ${observation.filename} | ${markdownCell(record.scientificName ?? record.vernacularName ?? "Unidentified")} | ${record.createdAt.slice(0, 10)} | ${markdownCell([record.locality, record.stateProvince, record.country].filter(Boolean).join(", ") || "Not provided")} | ${observation.likeCount} | ${markdownCell(record.remarks ?? "—")} |`,
      );
    }
  }

  if (skipped.length > 0) {
    lines.push("", "## Unavailable observation images", "");
    for (const label of skipped) lines.push(`- ${markdownCell(label)}`);
  }

  lines.push(
    "",
    "## Selection",
    "",
    prize === "best-picture" && winner.winningObservationUri
      ? "The confirmed winning picture is first when it is available. Remaining pictures are ordered by community likes, then newest upload."
      : "Pictures are ordered by community likes, then newest upload.",
    "",
  );
  return lines.join("\n");
}

function observationLabel(record: OccurrenceRecord): string {
  return record.scientificName ?? record.vernacularName ?? record.createdAt.slice(0, 10);
}

function markdownCell(value: string): string {
  return value.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}
