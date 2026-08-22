/**
 * Bot self-label detection — the same convention Bluesky uses for automated
 * accounts: a `com.atproto.label.defs#selfLabels` label with value "bot"
 * living in the `labels` field of the account's own `app.bsky.actor.profile`
 * record (rkey "self"). Because the label is authored inside the account's
 * own repo, it is inherently self-reported; we only read it.
 */

import { getPdsRecord } from "./pds";

const BLUESKY_PROFILE_COLLECTION = "app.bsky.actor.profile";
const SELF_RKEY = "self";

/** True when a record's `labels` value carries the "bot" self-label.
 *  Tolerates missing/malformed fields by design — absence means "not labeled". */
export function labelsIncludeBot(labels: unknown): boolean {
  if (typeof labels !== "object" || labels === null) return false;
  const values = (labels as { values?: unknown }).values;
  if (!Array.isArray(values)) return false;
  return values.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { val?: unknown }).val === "bot",
  );
}

/**
 * Which of the given accounts self-label as bots. One public PDS read per
 * DID; accounts with no Bluesky profile record (or an unreachable PDS) are
 * simply not bots. Fail-open everywhere: labeling can never break a page.
 */
export async function fetchBotSelfLabeledDids(dids: readonly string[]): Promise<Set<string>> {
  const results = await Promise.all(
    dids.map(async (did) => {
      const record = await getPdsRecord(did, BLUESKY_PROFILE_COLLECTION, SELF_RKEY).catch(
        () => null,
      );
      return record && labelsIncludeBot(record.value.labels) ? did : null;
    }),
  );
  return new Set(results.filter((did): did is string => did !== null));
}
