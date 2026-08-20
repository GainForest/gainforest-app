export const LANGUAGE_COOKIE_NAME = "bumicerts-language";

export const SUPPORTED_LOCALES = ["en", "es", "pt", "sw", "id"] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguageCode = "en";

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
] as const satisfies ReadonlyArray<{
  code: SupportedLanguageCode;
  label: string;
  nativeLabel: string;
}>;

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
  return (
    SUPPORTED_LANGUAGES.find((language) => language.code === code)?.nativeLabel ??
    code.toUpperCase()
  );
}
