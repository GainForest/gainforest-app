import { headers } from "next/headers";
import { after } from "next/server";
import { getAuthForwardCookie } from "@/app/_lib/auth";
import {
  endedRounds,
  fetchRoundCollectors,
  fetchRoundTopLiked,
  frozenWinnersFor,
  type BioblitzRound,
} from "@/app/_lib/bioblitz";
import { bioblitzBadgeKey, recognitionKeyFromTitle } from "@/app/_lib/recognition-badges";
import { canonicalBioblitzAwardInputs } from "@/app/_lib/bioblitz-notification-reconciliation";
import {
  bioblitzNotificationSourceId,
  listBioblitzNotificationSummaries,
  markBioblitzNotificationHandled,
  prepareBioblitzWinnerNotification,
  processBioblitzWinnerNotification,
  type BioblitzNotificationSummary,
  type PreparedBioblitzNotification,
} from "@/app/_lib/bioblitz-notifications";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { fetchInternalBadgeData, type InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import { RecognitionMutationError, awardRecognition, type RecognitionAwardSnapshot } from "@/app/internal/badges/_lib/recognition";
import type { BioblitzPrize, BioblitzWinnerInput } from "@/lib/email-notifications/bioblitz";

export const runtime = "nodejs";
export const maxDuration = 60;
const USABLE_INVOCATION_MS = 55_000;

/**
 * Moderator control for BioBlitz winner badges.
 *
 * GET  → per ended round, whether each of the two winner badges has been
 *        awarded yet (drives the "Award winner badges" button on /bioblitz).
 * POST → awards the round's computed winners or performs one explicit
 *        moderator action for a recorded prize notification. Nothing about
 *        recipients or the winning picture is trusted from the request body.
 */

type RoundAwardState = {
  id: number;
  mostImages: boolean;
  bestPicture: boolean;
  mostImagesNotification?: BioblitzNotificationSummary;
  bestPictureNotification?: BioblitzNotificationSummary;
};

async function loadAccess(): Promise<
  { error: Response } | { repoDid: string; moderatorDid: string }
> {
  const access = await getGainForestModeratorAccess();
  if (!access.isLoggedIn || !access.session.isLoggedIn) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  }
  if (!access.configured || !access.isModerator || !access.repoDid) {
    return { error: Response.json({ error: "You do not have access to award badges." }, { status: 403 }) } as const;
  }
  return { repoDid: access.repoDid, moderatorDid: access.session.did } as const;
}

/** Which round-scoped winner badges already have at least one award. */
async function awardStateFor(data: InternalBadgeData, rounds: BioblitzRound[]): Promise<RoundAwardState[]> {
  const keyByDefinitionUri = new Map<string, string>();
  for (const definition of data.definitions) {
    const key = recognitionKeyFromTitle(definition.title);
    if (key) keyByDefinitionUri.set(definition.uri, key);
  }
  const awardsByKey = new Map<string, string>();
  const conflictingKeys = new Set<string>();
  for (const award of data.awards) {
    const key = keyByDefinitionUri.get(award.badge.uri);
    if (!key || !award.subjectDid || conflictingKeys.has(key)) continue;
    const existing = awardsByKey.get(key);
    if (existing && existing !== award.subjectDid) {
      awardsByKey.delete(key);
      conflictingKeys.add(key);
    } else {
      awardsByKey.set(key, award.subjectDid);
    }
  }
  const notifications = await listBioblitzNotificationSummaries(rounds.flatMap(round => {
    const most = awardsByKey.get(bioblitzBadgeKey("most-images", round.id));
    const best = awardsByKey.get(bioblitzBadgeKey("best-picture", round.id));
    return [
      ...(most ? [{ roundId: round.id, prize: "most-observations" as const, winnerDid: most }] : []),
      ...(best ? [{ roundId: round.id, prize: "best-picture" as const, winnerDid: best }] : []),
    ];
  }));
  return rounds.map((round) => ({
    id: round.id,
    mostImages: awardsByKey.has(bioblitzBadgeKey("most-images", round.id)),
    bestPicture: awardsByKey.has(bioblitzBadgeKey("best-picture", round.id)),
    ...(awardsByKey.has(bioblitzBadgeKey("most-images", round.id))
      ? { mostImagesNotification: notifications.get(bioblitzNotificationSourceId(round.id, "most-observations")) }
      : {}),
    ...(awardsByKey.has(bioblitzBadgeKey("best-picture", round.id))
      ? { bestPictureNotification: notifications.get(bioblitzNotificationSourceId(round.id, "best-picture")) }
      : {}),
  }));
}

function notificationInput(round: BioblitzRound, prize: BioblitzPrize, award: RecognitionAwardSnapshot): BioblitzWinnerInput {
  return { roundId: round.id, roundLabel: round.label, prize, winnerDid: award.subjectDid, createdAt: award.createdAt };
}

type PreparedAwardNotification = PreparedBioblitzNotification & { prize: BioblitzPrize };

function scheduleNotificationProcessing(prepared: PreparedAwardNotification[], deadline: Date): void {
  const outboxIds = prepared.flatMap(item => item.processOutboxId ? [item.processOutboxId] : []);
  if (outboxIds.length === 0) return;
  after(async () => {
    await Promise.all(outboxIds.map(outboxId => processBioblitzWinnerNotification(outboxId, deadline)));
  });
}

function applyPreparedNotifications(state: RoundAwardState, prepared: PreparedAwardNotification[]): RoundAwardState {
  let result = state;
  for (const item of prepared) {
    result = item.prize === "most-observations"
      ? { ...result, mostImagesNotification: item.notification }
      : { ...result, bestPictureNotification: item.notification };
  }
  return result;
}

export async function GET() {
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  try {
    const rounds = endedRounds();
    const data = await fetchInternalBadgeData(loaded.repoDid, { includeAwards: true });
    return Response.json({ rounds: await awardStateFor(data, rounds) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[bioblitz-awards] GET failed:", error);
    return Response.json({ error: "Could not load the badge state." }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const invocationStartedAt = Date.now();
  const loaded = await loadAccess();
  if ("error" in loaded) return loaded.error;

  const body = (await request.json().catch(() => null)) as { action?: unknown; roundId?: unknown; prize?: unknown } | null;
  const rounds = endedRounds();
  const roundId = typeof body?.roundId === "number" && Number.isInteger(body.roundId) ? body.roundId : null;
  const round = roundId ? rounds.find(item => item.id === roundId) ?? null : null;
  const action = body?.action === undefined
    ? "award"
    : body.action === "award" || body.action === "retry-notification" || body.action === "mark-notification-handled"
      ? body.action
      : null;
  if (!action) {
    return Response.json({ error: "Choose a supported BioBlitz award action." }, { status: 400 });
  }

  try {
    if (!round) {
      return Response.json({ error: "Badges can only be managed for a finished round." }, { status: 400 });
    }

    if (action === "retry-notification" || action === "mark-notification-handled") {
      const prize: BioblitzPrize | null = body?.prize === "most-observations" || body?.prize === "best-picture" ? body.prize : null;
      if (!prize) return Response.json({ error: "Choose a BioBlitz prize notification." }, { status: 400 });
      const data = await fetchInternalBadgeData(loaded.repoDid, { includeAwards: true });
      const award = canonicalBioblitzAwardInputs(data, [round]).find(input => input.prize === prize);
      if (!award) return Response.json({ error: "This prize does not have a recorded winner notification." }, { status: 404 });

      let notification: BioblitzNotificationSummary;
      if (action === "retry-notification") {
        const summaries = await listBioblitzNotificationSummaries([award]);
        const current = summaries.get(bioblitzNotificationSourceId(round.id, prize));
        if (!current?.canRetry) {
          return Response.json({ error: "This notification has already been prepared. Use its current status instead." }, { status: 409 });
        }
        const prepared = { prize, ...await prepareBioblitzWinnerNotification(award) };
        scheduleNotificationProcessing([prepared], new Date(invocationStartedAt + USABLE_INVOCATION_MS));
        notification = prepared.notification;
      } else {
        notification = await markBioblitzNotificationHandled({
          roundId: round.id,
          prize,
          winnerDid: award.winnerDid,
          moderatorDid: loaded.moderatorDid,
        });
      }
      return Response.json({ roundId: round.id, prize, notification }, { headers: { "cache-control": "no-store" } });
    }

    const headerList = await headers();
    const cookie = getAuthForwardCookie(headerList.get("cookie"));
    // Hand-pinned winners take precedence; only prizes without a pin are
    // recomputed from the final board. Each durable award independently creates
    // notification work; notification failure never blocks the other prize.
    const pinned = frozenWinnersFor(round, null);
    const [board, liked] = await Promise.all([
      pinned.mostObservations === undefined ? fetchRoundCollectors(round, "round", undefined, "required") : null,
      pinned.bestPicture === undefined ? fetchRoundTopLiked(round, 1) : null,
    ]);
    const topCollector = board?.collectors[0] ?? null;
    const mostObservations = pinned.mostObservations !== undefined
      ? pinned.mostObservations
      : topCollector && { did: topCollector.did, count: topCollector.count as number | null };
    const computedBestPicture = liked?.[0] ?? null;
    const bestPicture = pinned.bestPicture !== undefined
      ? pinned.bestPicture && { did: pinned.bestPicture.did, winningObservationUri: round.bestPicture?.winningObservationUri }
      : computedBestPicture ? { did: computedBestPicture.record.did, winningObservationUri: computedBestPicture.record.atUri } : null;
    if (!mostObservations && !bestPicture) {
      return Response.json({ error: "This round has no winners to award yet." }, { status: 409 });
    }

    const failures: unknown[] = [];
    const notificationInputs: BioblitzWinnerInput[] = [];
    if (mostObservations) {
      try {
        const countNote = mostObservations.count != null ? ` (${mostObservations.count})` : "";
        const award = await awardRecognition(
          loaded.repoDid, cookie, mostObservations.did, bioblitzBadgeKey("most-images", round.id),
          `BioBlitz ${round.label} winner — most observations${countNote}.`,
        );
        notificationInputs.push(notificationInput(round, "most-observations", award));
      } catch (error) {
        failures.push(error);
      }
    }
    if (bestPicture) {
      try {
        const award = await awardRecognition(
          loaded.repoDid, cookie, bestPicture.did, bioblitzBadgeKey("best-picture", round.id),
          `BioBlitz ${round.label} winner — best picture.`, bestPicture.winningObservationUri,
        );
        notificationInputs.push(notificationInput(round, "best-picture", award));
      } catch (error) {
        failures.push(error);
      }
    }
    if (notificationInputs.length === 0 && failures.length > 0) throw failures[0];

    const prepared = await Promise.all(notificationInputs.map(async input => ({
      prize: input.prize,
      ...await prepareBioblitzWinnerNotification(input),
    })));
    scheduleNotificationProcessing(prepared, new Date(invocationStartedAt + USABLE_INVOCATION_MS));

    const data = await fetchInternalBadgeData(loaded.repoDid, { includeAwards: true });
    const state = applyPreparedNotifications((await awardStateFor(data, [round]))[0]!, prepared);
    return Response.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[bioblitz-awards] POST failed:", error);
    const status = error instanceof RecognitionMutationError ? error.status : 500;
    const message = error instanceof RecognitionMutationError ? error.message : "Could not update the BioBlitz awards or notifications.";
    return Response.json({ error: message }, { status });
  }
}
