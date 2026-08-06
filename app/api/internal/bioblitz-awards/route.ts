import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import {
  endedRounds,
  fetchRoundCollectors,
  fetchRoundTopLiked,
  frozenWinnersFor,
  type BioblitzRound,
} from "@/app/_lib/bioblitz";
import { bioblitzBadgeKey, recognitionKeyFromTitle } from "@/app/_lib/recognition-badges";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchInternalBadgeData, type InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import { RecognitionMutationError, awardRecognition } from "@/app/internal/badges/_lib/recognition";

export const runtime = "nodejs";

/**
 * Moderator control for BioBlitz winner badges.
 *
 * GET  → per ended round, whether each of the two winner badges has been
 *        awarded yet (drives the "Award winner badges" button on /bioblitz).
 * POST → { roundId }: snapshots the round's computed winners into durable
 *        recognition awards. Nothing about recipients or the winning picture
 *        is trusted from the request body.
 */

type RoundAwardState = { id: number; mostImages: boolean; bestPicture: boolean };

async function loadAccess() {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to award badges." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid } as const;
}

/** Which round-scoped winner badges already have at least one award. */
function awardStateFor(data: InternalBadgeData, rounds: BioblitzRound[]): RoundAwardState[] {
  const keyByDefinitionUri = new Map<string, string>();
  for (const definition of data.definitions) {
    const key = recognitionKeyFromTitle(definition.title);
    if (key) keyByDefinitionUri.set(definition.uri, key);
  }
  const awardedKeys = new Set<string>();
  for (const award of data.awards) {
    const key = keyByDefinitionUri.get(award.badge.uri);
    if (key) awardedKeys.add(key);
  }
  return rounds.map((round) => ({
    id: round.id,
    mostImages: awardedKeys.has(bioblitzBadgeKey("most-images", round.id)),
    bestPicture: awardedKeys.has(bioblitzBadgeKey("best-picture", round.id)),
  }));
}

export async function GET() {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  try {
    const rounds = endedRounds();
    const data = await fetchInternalBadgeData(loaded.repoDid, { includeAwards: true });
    return Response.json({ rounds: awardStateFor(data, rounds) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[bioblitz-awards] GET failed:", error);
    return Response.json({ error: "Could not load the badge state." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const body = (await request.json().catch(() => null)) as { roundId?: unknown } | null;
  const roundId = typeof body?.roundId === "number" && Number.isInteger(body.roundId) ? body.roundId : null;
  const round = roundId ? endedRounds().find((item) => item.id === roundId) ?? null : null;
  if (!round) {
    return Response.json({ error: "Badges can only be awarded for a finished round." }, { status: 400 });
  }

  const headerList = await headers();
  const cookie = getAuthForwardCookie(headerList.get("cookie"));

  try {
    // Hand-pinned winners take precedence; only prizes without a pin are
    // recomputed from the final board. The selected recipient and picture are
    // then snapshotted into a durable recognition award.
    const pinned = frozenWinnersFor(round, null);
    const [board, liked] = await Promise.all([
      // Weekly counting records are governance input to this irreversible
      // award, so this path reads them uncached and fails closed.
      pinned.mostObservations === undefined
        ? fetchRoundCollectors(round, "round", undefined, "required")
        : null,
      pinned.bestPicture === undefined ? fetchRoundTopLiked(round, 1) : null,
    ]);
    const topCollector = board?.collectors[0] ?? null;
    const mostObservations =
      pinned.mostObservations !== undefined
        ? pinned.mostObservations
        : topCollector && { did: topCollector.did, count: topCollector.count as number | null };
    const computedBestPicture = liked?.[0] ?? null;
    const bestPicture =
      pinned.bestPicture !== undefined
        ? pinned.bestPicture && {
            did: pinned.bestPicture.did,
            winningObservationUri: round.bestPicture?.winningObservationUri,
          }
        : computedBestPicture
          ? { did: computedBestPicture.record.did, winningObservationUri: computedBestPicture.record.atUri }
          : null;
    if (!mostObservations && !bestPicture) {
      return Response.json({ error: "This round has no winners to award yet." }, { status: 409 });
    }

    if (mostObservations) {
      const countNote = mostObservations.count != null ? ` (${mostObservations.count})` : "";
      await awardRecognition(
        loaded.repoDid,
        cookie,
        mostObservations.did,
        bioblitzBadgeKey("most-images", round.id),
        `BioBlitz ${round.label} winner — most observations${countNote}.`,
      );
    }
    if (bestPicture) {
      await awardRecognition(
        loaded.repoDid,
        cookie,
        bestPicture.did,
        bioblitzBadgeKey("best-picture", round.id),
        `BioBlitz ${round.label} winner — best picture.`,
        bestPicture.winningObservationUri,
      );
    }

    const data = await fetchInternalBadgeData(loaded.repoDid, { includeAwards: true });
    const state = awardStateFor(data, [round])[0]!;
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[bioblitz-awards] POST failed:", error);
    const status = error instanceof RecognitionMutationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Could not award the badges.";
    return Response.json({ error: message }, { status });
  }
}
