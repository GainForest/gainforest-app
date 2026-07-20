import { headers } from "next/headers";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import { endedRounds, fetchRoundCollectors, fetchRoundTopLiked, type BioblitzRound } from "@/app/_lib/bioblitz";
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
 * POST → { roundId }: award the round's winners their badges. The winners are
 *        recomputed server-side from the same data the public page shows —
 *        most observations goes to the round's top collector, best picture to
 *        the owner of the round's most-liked photo — so nothing about the
 *        recipients is ever trusted from the request body.
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
    // Recompute the round's winners from the live data (test/hidden accounts
    // are already excluded by the board tally).
    const [board, liked] = await Promise.all([
      fetchRoundCollectors(round, "round"),
      fetchRoundTopLiked(round, 1),
    ]);
    const mostObservations = board.collectors[0] ?? null;
    const bestPicture = liked[0] ?? null;
    if (!mostObservations && !bestPicture) {
      return Response.json({ error: "This round has no winners to award yet." }, { status: 409 });
    }

    if (mostObservations) {
      await awardRecognition(
        loaded.repoDid,
        cookie,
        mostObservations.did,
        bioblitzBadgeKey("most-images", round.id),
        `BioBlitz ${round.label} winner — most observations (${mostObservations.count}).`,
      );
    }
    if (bestPicture) {
      await awardRecognition(
        loaded.repoDid,
        cookie,
        bestPicture.record.did,
        bioblitzBadgeKey("best-picture", round.id),
        `BioBlitz ${round.label} winner — best picture.`,
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
