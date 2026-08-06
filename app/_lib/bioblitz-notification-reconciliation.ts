import "server-only";

import { endedRounds, type BioblitzRound } from "./bioblitz";
import { GAINFOREST_MODERATION_REPO_DID } from "./indexer";
import { parseRecognitionBadgeKey, recognitionKeyFromTitle } from "./recognition-badges";
import { createBioblitzProducerRuntime } from "@/lib/email-notifications/bioblitz-runtime";
import { listBioblitzNotificationSummaries } from "./bioblitz-notifications";
import { fetchInternalBadgeData, type InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import type { BioblitzPrize, BioblitzWinnerInput } from "@/lib/email-notifications/bioblitz";

const RECONCILIATION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_RECONCILIATION_CANDIDATES = 20;

class ReconciliationDeadlineExceeded extends Error {
  constructor() {
    super("BioBlitz notification reconciliation reached its invocation deadline.");
    this.name = "ReconciliationDeadlineExceeded";
  }
}

async function beforeDeadline<T>(work: () => Promise<T>, deadline: Date): Promise<T> {
  const remaining = deadline.getTime() - Date.now();
  if (remaining <= 0) throw new ReconciliationDeadlineExceeded();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ReconciliationDeadlineExceeded()), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export async function reconcileRecentBioblitzNotifications(
  deadline: Date,
): Promise<{ candidates: number; completed: boolean }> {
  let candidates = 0;
  try {
    const producer = createBioblitzProducerRuntime();
    if (producer.config.emailDisabled) {
      return { candidates: 0, completed: true };
    }
    const rounds = endedRounds();
    const data = await beforeDeadline(
      () => fetchInternalBadgeData(GAINFOREST_MODERATION_REPO_DID, { includeAwards: true }),
      deadline,
    );
    const inputs = canonicalBioblitzAwardInputs(data, rounds);
    const summaries = await beforeDeadline(() => listBioblitzNotificationSummaries(inputs), deadline);
    const missing = inputs.filter(input => summaries.get(`bioblitz:${input.roundId}:${input.prize}`)?.status === "not_prepared");
    if (missing.length === 0) return { candidates: 0, completed: true };
    for (const input of missing.slice(0, MAX_RECONCILIATION_CANDIDATES)) {
      if (Date.now() >= deadline.getTime()) return { candidates, completed: false };
      // Once a database mutation starts, await its definitive result. Racing it
      // against the deadline could let a late commit cross into queue draining.
      await producer.enqueue(input);
      candidates += 1;
    }
    return { candidates, completed: missing.length <= MAX_RECONCILIATION_CANDIDATES };
  } catch (error) {
    if (error instanceof ReconciliationDeadlineExceeded) return { candidates, completed: false };
    throw error;
  }
}
