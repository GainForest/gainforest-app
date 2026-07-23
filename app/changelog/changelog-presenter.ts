const CONVENTIONAL_COMMIT_PREFIX = /^[a-z]+(?:\([^)]+\))?!?:\s*/i;
const DID_LIKE_IDENTIFIER = /\bdid:[^\s),;]+/gi;

/** Keeps the public timeline readable without exposing protocol identifiers. */
export function plainChangelogSubject(subject: string, hiddenIdentifierLabel: string): string {
  return subject
    .replace(CONVENTIONAL_COMMIT_PREFIX, "")
    .replace(DID_LIKE_IDENTIFIER, hiddenIdentifierLabel)
    .replace(/\s+/g, " ")
    .trim();
}
