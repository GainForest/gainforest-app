import "server-only";

import type { BioblitzRound } from "./bioblitz";
import { parseRecognitionBadgeKey, recognitionKeyFromTitle } from "./recognition-badges";
import type { InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import type { BioblitzPrize, BioblitzWinnerInput } from "@/lib/email-notifications/bioblitz";

export function canonicalBioblitzAwardInputs(
  data: InternalBadgeData,
  rounds: BioblitzRound[],
): BioblitzWinnerInput[] {
  const roundsById = new Map(rounds.map(round => [round.id, round]));
  const keyByDefinitionUri = new Map(data.definitions.flatMap(definition => {
    const key = recognitionKeyFromTitle(definition.title);
    return key ? [[definition.uri, key] as const] : [];
  }));
  const inputs = new Map<string, BioblitzWinnerInput>();
  const conflicts = new Set<string>();
  for (const award of data.awards) {
    const key = keyByDefinitionUri.get(award.badge.uri);
    const parsed = key ? parseRecognitionBadgeKey(key) : null;
    if (parsed?.family !== "bioblitz" || parsed.roundId === null) continue;
    const round = roundsById.get(parsed.roundId);
    if (!round || !award.subjectDid) continue;
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
