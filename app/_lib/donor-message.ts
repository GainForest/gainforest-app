// A donation receipt's `notes` field is meant for a short message the donor
// left with their gift. But some older receipts stored a machine-generated
// payment note there instead (e.g. "0xabc… paid 0.01USDC using wallet",
// "0xabc… paid 3000CELO using wallet", or "… tipped 5USDC to GainForest (…)").
// Those were never written by a person, so they must never surface as a
// "donor message". The amount is followed by an optional currency code (USDC,
// CELO, …), so we match any token there. Only genuine, human-left notes
// survive this filter.
const SYNTHETIC_NOTE_PATTERNS = [
  /\bpaid\s+[\d.]+\s*[a-z]*\s+using\s+wallet\b/i,
  /\btipped\s+[\d.]+\s*[a-z]*\s+to\s+GainForest\b/i,
];

export function donorMessageFromNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  if (SYNTHETIC_NOTE_PATTERNS.some((pattern) => pattern.test(trimmed))) return null;
  return trimmed;
}
