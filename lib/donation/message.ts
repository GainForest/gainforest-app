/**
 * Optional short donor message that rides along with a donation.
 *
 * The message is stored in the funding receipt's `notes` field (a free-text
 * field the lexicon already allows) and surfaced back to the recipient where
 * their donations are shown. It never carries the donor's name, so an
 * anonymous donation's message stays unattributed on its own.
 *
 * Pure and framework-free so the checkout client and the settlement routes can
 * share the exact same limit and normalisation.
 */

/** Kept deliberately "short" per the product ask; well within the receipt
 *  `notes` lexicon cap (500) so the stored value always validates. */
export const DONATION_MESSAGE_MAX_LENGTH = 280;

/**
 * Normalise a raw donor message into what we actually persist:
 *  - non-strings and blank input become `null` (blank changes nothing), and
 *  - whitespace is trimmed and the text is clamped to the max length.
 */
export function sanitizeDonationMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.replace(/\r\n/g, "\n").trim();
  if (!normalised) return null;
  return normalised.slice(0, DONATION_MESSAGE_MAX_LENGTH);
}
