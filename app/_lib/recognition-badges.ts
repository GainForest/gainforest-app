/**
 * Recognition badges shown as awards of honour on a recipient's public profile.
 *
 * Two families exist:
 *   - Manual badges a GainForest steward can toggle from an account's profile
 *     (currently just the Rewilding grant).
 *   - BioBlitz winner badges, awarded per round from the /bioblitz page by a
 *     moderator once a round closes. Their keys are round-scoped
 *     (`bioblitz-most-images-round-3`) so one profile can hold wins from
 *     several rounds at once. The two legacy round-less keys are still
 *     recognised for display, but can no longer be assigned.
 *
 * The badge key is the stable `title` stored on the badge definition record;
 * the human-readable label + description are translated in the UI (keyed by
 * the badge kind + round). Keep these keys in sync with the indexer award scan
 * and the award controls.
 */

/** Badges a steward can still toggle by hand on a profile. */
export const MANUAL_RECOGNITION_BADGE_KEYS = ["rewilding-grant"] as const;

export type ManualRecognitionBadgeKey = (typeof MANUAL_RECOGNITION_BADGE_KEYS)[number];

/** The two prizes a BioBlitz round awards. */
export type BioblitzPrizeKind = "most-images" | "best-picture";

export const BIOBLITZ_PRIZE_KINDS: readonly BioblitzPrizeKind[] = ["most-images", "best-picture"];

/** Any recognised badge key (manual, legacy BioBlitz, or round-scoped BioBlitz). */
export type RecognitionBadgeKey = string;

export type ParsedRecognitionBadge =
  | { family: "manual"; key: ManualRecognitionBadgeKey }
  | {
      family: "bioblitz";
      prize: BioblitzPrizeKind;
      /** Null for the legacy round-less keys that predate round-scoped awards. */
      roundId: number | null;
    };

const BIOBLITZ_KEY_PATTERN = /^bioblitz-(most-images|best-picture)(?:-round-(\d+))?$/;

/** Round-scoped badge key for one BioBlitz prize, e.g. "bioblitz-best-picture-round-2". */
export function bioblitzBadgeKey(prize: BioblitzPrizeKind, roundId: number): string {
  return `bioblitz-${prize}-round-${roundId}`;
}

export function parseRecognitionBadgeKey(key: string): ParsedRecognitionBadge | null {
  if ((MANUAL_RECOGNITION_BADGE_KEYS as readonly string[]).includes(key)) {
    return { family: "manual", key: key as ManualRecognitionBadgeKey };
  }
  const match = BIOBLITZ_KEY_PATTERN.exec(key);
  if (match) {
    const roundId = match[2] ? Number.parseInt(match[2], 10) : null;
    if (roundId !== null && (!Number.isFinite(roundId) || roundId < 1)) return null;
    return { family: "bioblitz", prize: match[1] as BioblitzPrizeKind, roundId };
  }
  return null;
}

export function isRecognitionBadgeKey(value: string): boolean {
  return parseRecognitionBadgeKey(value) !== null;
}

export function isManualRecognitionBadgeKey(value: string): value is ManualRecognitionBadgeKey {
  return (MANUAL_RECOGNITION_BADGE_KEYS as readonly string[]).includes(value);
}

/**
 * Reverse a badge-definition title that went through the indexer's
 * alphanumeric-only normalisation (hyphens stripped) back to its canonical
 * badge key. Also accepts already-canonical keys, so callers can pass either
 * form. Returns null when the title is not a recognised recognition badge.
 */
export function recognitionKeyFromTitle(title: string): string | null {
  const trimmed = title.trim().toLowerCase();
  if (isRecognitionBadgeKey(trimmed)) return trimmed;
  const squashed = trimmed.replace(/[^a-z0-9]+/g, "");
  if (squashed === "rewildinggrant") return "rewilding-grant";
  const match = /^bioblitz(mostimages|bestpicture)(?:round(\d+))?$/.exec(squashed);
  if (!match) return null;
  const prize: BioblitzPrizeKind = match[1] === "mostimages" ? "most-images" : "best-picture";
  return match[2] ? bioblitzBadgeKey(prize, Number.parseInt(match[2], 10)) : `bioblitz-${prize}`;
}

/** English round name used inside stored record descriptions (round 1 was the
 *  pilot). The UI translates its own round names; keep in sync with
 *  bioblitz.ts round labels. */
export function bioblitzRoundName(roundId: number): string {
  return roundId === 1 ? "Pilot Round" : `Round ${roundId}`;
}

/** Stored on the badge definition/award records (internal, not the user-facing label). */
export function recognitionBadgeDescription(key: string): string {
  const parsed = parseRecognitionBadgeKey(key);
  if (parsed?.family === "manual") {
    return "Recipient of a Rewilding the Web grant.";
  }
  if (parsed?.family === "bioblitz") {
    const round = parsed.roundId !== null ? ` (${bioblitzRoundName(parsed.roundId)})` : "";
    return parsed.prize === "most-images"
      ? `BioBlitz winner — most observations uploaded in a round${round}.`
      : `BioBlitz winner — best biodiversity picture of a round${round}.`;
  }
  return "GainForest recognition badge.";
}

/** Display order: manual badges first, then BioBlitz wins newest round first
 *  (most observations before best picture within a round). */
export function compareRecognitionBadgeKeys(a: string, b: string): number {
  const pa = parseRecognitionBadgeKey(a);
  const pb = parseRecognitionBadgeKey(b);
  const familyRank = (p: ParsedRecognitionBadge | null) => (p?.family === "manual" ? 0 : 1);
  if (familyRank(pa) !== familyRank(pb)) return familyRank(pa) - familyRank(pb);
  if (pa?.family === "bioblitz" && pb?.family === "bioblitz") {
    const roundDiff = (pb.roundId ?? 0) - (pa.roundId ?? 0);
    if (roundDiff !== 0) return roundDiff;
    if (pa.prize !== pb.prize) return pa.prize === "most-images" ? -1 : 1;
  }
  return a.localeCompare(b);
}
