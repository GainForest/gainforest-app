/**
 * Deep-merges a partial translation catalog over a complete base catalog.
 *
 * `i18n/request.ts` hands next-intl a single namespace tree, and a missing key
 * surfaces as a runtime error rather than a silent blank. A locale that is
 * still being translated therefore needs every key present. Rather than
 * duplicating the entire English catalog into the new locale's files (which
 * would also defeat `scripts/check-i18n-untranslated.mjs`, since copied English
 * is exactly what it flags), we ship only the namespaces that are genuinely
 * translated and layer them over English at build time.
 *
 * Override semantics: plain objects merge recursively; every other value —
 * including arrays — is replaced wholesale, so a translated array never ends up
 * spliced together with the English one.
 */

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeInto(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const merged: PlainObject = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    merged[key] = key in base ? mergeInto(base[key], overrideValue) : overrideValue;
  }
  return merged;
}

/**
 * Returns `base` with `override` layered on top. Neither input is mutated. The
 * result is typed as the base catalog, so a partially translated locale still
 * satisfies the full message shape.
 */
export function mergeMessages<Base extends PlainObject>(
  base: Base,
  override: PlainObject,
): Base {
  return mergeInto(base, override) as Base;
}
