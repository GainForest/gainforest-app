import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LOCALES,
  isSupportedLanguageCode,
  type SupportedLanguageCode,
} from "./languages";

export const LOCALE_REQUEST_HEADER_NAME = "x-bumicerts-locale";

export function getPathLocale(
  pathname: string,
): SupportedLanguageCode | undefined {
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return isSupportedLanguageCode(firstSegment) ? firstSegment : undefined;
}

export function stripLocaleFromPathname(pathname: string): string {
  const locale = getPathLocale(pathname);
  if (!locale) return pathname;

  const strippedPathname = pathname.slice(locale.length + 1);
  return strippedPathname.startsWith("/") ? strippedPathname : `/${strippedPathname}`;
}

export function withLocalePrefix(
  pathname: string,
  locale: SupportedLanguageCode = DEFAULT_LANGUAGE,
): string {
  const pathnameWithoutLocale = stripLocaleFromPathname(pathname);
  return pathnameWithoutLocale === "/"
    ? `/${locale}`
    : `/${locale}${pathnameWithoutLocale}`;
}

export function localizeHref(
  href: string,
  locale: SupportedLanguageCode,
): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;

  const [pathnameWithMaybeQuery = "/", hash = ""] = href.split("#", 2);
  const [pathname = "/", query = ""] = pathnameWithMaybeQuery.split("?", 2);
  const localizedPathname = withLocalePrefix(pathname, locale);
  const querySuffix = query ? `?${query}` : "";
  const hashSuffix = hash ? `#${hash}` : "";

  return `${localizedPathname}${querySuffix}${hashSuffix}`;
}

export function getLocalizedPathnames(pathname: string): Record<SupportedLanguageCode, string> {
  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, withLocalePrefix(pathname, locale)]),
  ) as Record<SupportedLanguageCode, string>;
}
