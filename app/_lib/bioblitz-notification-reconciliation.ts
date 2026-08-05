import "server-only";

import { endedRounds, type BioblitzRound } from "./bioblitz";
import { GAINFOREST_MODERATION_REPO_DID } from "./indexer";
import { parseRecognitionBadgeKey, recognitionKeyFromTitle } from "./recognition-badges";
import { createBioblitzProducerRuntime } from "@/lib/notifications/bioblitz-runtime";
import { listBioblitzNotificationSummaries } from "./bioblitz-notifications";
import { fetchInternalBadgeData, type InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import type { BioblitzPrize, BioblitzWinnerInput } from "@/lib/notifications/bioblitz";

const RECONCILIATION_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function canonicalBioblitzAwardInputs(
  data: InternalBadgeData,
  rounds: BioblitzRound[],
  now = new Date(),
): BioblitzWinnerInput[] {
  const roundsById = new Map(rounds.map(round => [round.id, round]));
  const keyByDefinitionUri = new Map(data.definitions.flatMap(definition => {
    const key = recognitionKeyFromTitle(definition.title);
    return key ? [[definition.uri, key] as const] : [];
  }));
  const cutoff = now.getTime() - RECONCILIATION_AGE_MS;
  const inputs = new Map<string, BioblitzWinnerInput>();
  const conflicts = new Set<string>();
  for (const award of data.awards) {
    const key = keyByDefinitionUri.get(award.badge.uri);
    const parsed = key ? parseRecognitionBadgeKey(key) : null;
    if (parsed?.family !== "bioblitz" || parsed.roundId === null) continue;
    const round = roundsById.get(parsed.roundId);
    if (!round || !award.subjectDid || new Date(award.createdAt).getTime() < cutoff) continue;
    const prize: BioblitzPrize = parsed.prize === "most-images" ? "most-observations" : "best-picture";
    const source = `bioblitz:${round.id}:${prize}`;
    const existing = inputs.get(source);
    if (existing && existing.winnerDid !== award.subjectDid) {
      conflicts.add(source);
      inputs.delete(source);
      continue;
    }
    if (!conflicts.has(source)) inputs.set(source, {
      roundId: round.id, roundLabel: round.label, prize, winnerDid: award.subjectDid, createdAt: award.createdAt,
    });
  }
  return [...inputs.entries()].filter(([source]) => !conflicts.has(source)).map(([, input]) => input);
}

export async function reconcileRecentBioblitzNotifications(): Promise<number> {
  const rounds = endedRounds();
  const data = await fetchInternalBadgeData(GAINFOREST_MODERATION_REPO_DID, { includeAwards: true });
  const inputs = canonicalBioblitzAwardInputs(data, rounds);
  const summaries = await listBioblitzNotificationSummaries(inputs);
  const missing = inputs.filter(input => summaries.get(`bioblitz:${input.roundId}:${input.prize}`)?.status === "not_prepared");
  if (missing.length === 0) return 0;
  const producer = createBioblitzProducerRuntime();
  for (const input of missing) await producer.enqueue(input);
  return missing.length;
}
