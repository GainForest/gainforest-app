import { fetchAccountCards } from "@/app/_lib/indexer";
import { fetchBotSelfLabeledDids } from "@/app/_lib/bot-self-label";
import type { ArenaReport } from "./types";

/**
 * Loads the scoring report without hard-depending on the scoring lib's
 * timeline: while it is missing or throws, callers render their shells with a
 * "scores are being computed" state instead of failing. The IO entry point
 * lives in ./data (server-only); ./scoring stays client-safe pure helpers.
 */
export async function loadReport(): Promise<ArenaReport | null> {
  try {
    const { loadArenaReport } = await import("./data");
    return await loadArenaReport();
  } catch (error) {
    console.error("[arena] loadArenaReport failed", error);
    return null;
  }
}

/** Display info resolved for one account DID (null when unknown). */
export type ArenaAgentNameEntry = {
  name: string | null;
  /** The account self-labels as a bot (app.bsky.actor.profile labels). */
  isBot: boolean;
};

/**
 * Resolve display names and bot self-labels for every account a page shows —
 * standings, problem owners, proposal authors, flaggers — in one round trip.
 * Accounts with no presence on the network fall back to their DID at render
 * time.
 */
export async function resolveAgentNames(
  report: ArenaReport,
): Promise<Map<string, ArenaAgentNameEntry>> {
  const dids = new Set<string>();
  for (const standing of report.standings) dids.add(standing.did);
  for (const problem of report.problems) {
    dids.add(problem.ownerDid);
    for (const proposal of problem.proposals) dids.add(proposal.did);
  }
  for (const flag of report.flags) dids.add(flag.did);

  const names = new Map<string, ArenaAgentNameEntry>();
  if (dids.size === 0) return names;
  const [cards, bots] = await Promise.all([
    fetchAccountCards([...dids]).catch(() => new Map()),
    fetchBotSelfLabeledDids([...dids]),
  ]);
  for (const did of dids) {
    const card = cards.get(did);
    names.set(did, {
      name: card?.displayName ?? card?.handle ?? null,
      isBot: bots.has(did),
    });
  }
  return names;
}
