export const LANGUAGE_COOKIE_NAME = "bumicerts-language";

export const SUPPORTED_LOCALES = ["en", "es", "pt", "sw", "id", "ar"] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LANGUAGE = "en" as const satisfies SupportedLanguageCode;

/**
 * Locales written right-to-left. Drives the `dir` attribute on <html>, so the
 * whole tree inherits direction instead of components opting in one by one.
 */
export const RTL_LOCALES = ["ar"] as const satisfies ReadonlyArray<SupportedLanguageCode>;

export type TextDirection = "ltr" | "rtl";

export function getLocaleDirection(code: SupportedLanguageCode): TextDirection {
  return RTL_LOCALES.some((locale) => locale === code) ? "rtl" : "ltr";
}

export function isRtlLocale(code: SupportedLanguageCode): boolean {
  return getLocaleDirection(code) === "rtl";
}

/** Returns a decoded cookie value while preserving malformed percent-encoding. */
export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name || rawValueParts.length === 0) continue;
    const value = rawValueParts.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "sw", label: "Swahili", nativeLabel: "Kiswahili" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  // Arabic is intentionally absent while its translations are still partial.
  // It stays in SUPPORTED_LOCALES so /ar routes resolve for testing, but it is
  // not offered in the language picker until the message catalog is complete.
] as const satisfies ReadonlyArray<{
  code: SupportedLanguageCode;
  label: string;
  nativeLabel: string;
}>;

/**
 * Locales complete enough to advertise publicly: offered in the language
 * picker, emitted as `hreflang` alternates, and listed in the sitemap.
 *
 * Derived from SUPPORTED_LANGUAGES so "in the picker" and "indexable" can never
 * drift apart. A locale in SUPPORTED_LOCALES but not here still routes (so /ar
 * can be tested end to end) while staying out of search results, which keeps a
 * part-translated locale from being indexed as duplicate English content.
 */
export const PUBLIC_LOCALES: ReadonlyArray<SupportedLanguageCode> =
  SUPPORTED_LANGUAGES.map((language) => language.code);

export function isPublicLocale(code: SupportedLanguageCode): code is PublicLanguageCode {
  return PUBLIC_LOCALES.includes(code);
}

/**
 * A locale with a complete translation. Content that is authored per locale in
 * code rather than in `messages/` — email templates, for instance — is keyed by
 * this narrower type, so adding a locale to SUPPORTED_LOCALES does not force
 * placeholder copy to be invented for it.
 */
export type PublicLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Narrows any supported locale to one that is fully translated, falling back to
 * English. Mirrors the behaviour of the message catalog, where a partially
 * translated locale resolves missing keys to English.
 */
export function resolvePublicLanguage(code: SupportedLanguageCode): PublicLanguageCode {
  return isPublicLocale(code) ? code : DEFAULT_LANGUAGE;
}

/** Native labels for every locale, including ones hidden from the picker. */
const LOCALE_NATIVE_LABELS: Record<SupportedLanguageCode, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  sw: "Kiswahili",
  id: "Bahasa Indonesia",
  ar: "العربية",
};

export function isSupportedLanguageCode(
  value: string | undefined,
): value is SupportedLanguageCode {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function resolveSupportedLanguage(
  value: string | undefined,
): SupportedLanguageCode {
  return isSupportedLanguageCode(value) ? value : DEFAULT_LANGUAGE;
}

function resolveLocaleCandidate(value: string): SupportedLanguageCode | undefined {
  const normalized = value.trim().toLowerCase();
  if (isSupportedLanguageCode(normalized)) return normalized;

  const baseLocale = normalized.split("-")[0];
  return isSupportedLanguageCode(baseLocale) ? baseLocale : undefined;
}

export function resolvePreferredLanguageFromHeader(
  acceptLanguage: string | null | undefined,
): SupportedLanguageCode {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const preferredLocale = acceptLanguage
    .split(",")
    .map((entry) => {
      const [localePart, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return {
        locale: localePart ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => resolveLocaleCandidate(entry.locale))
    .find((locale) => locale !== undefined);

  return preferredLocale ?? DEFAULT_LANGUAGE;
}

export function getLanguageLabel(code: SupportedLanguageCode): string {
  return LOCALE_NATIVE_LABELS[code] ?? code.toUpperCase();
}
