import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  LANGUAGE_COOKIE_NAME,
  resolvePreferredLanguageFromHeader,
  resolveSupportedLanguage,
} from "@/lib/i18n/languages";
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing";
import { messagesByLocale } from "@/messages/locales";

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const requestedLocale = await requestLocale;
  const routedLocale = headerStore.get(LOCALE_REQUEST_HEADER_NAME);
  const savedLocale = cookieStore.get(LANGUAGE_COOKIE_NAME)?.value;
  const requestedLanguage = locale ?? requestedLocale;
  const resolvedLocale = routedLocale
    ? resolveSupportedLanguage(routedLocale)
    : savedLocale
      ? resolveSupportedLanguage(savedLocale)
      : requestedLanguage
        ? resolveSupportedLanguage(requestedLanguage)
        : resolvePreferredLanguageFromHeader(headerStore.get("accept-language"));

  return {
    locale: resolvedLocale,
    messages: messagesByLocale[resolvedLocale],
  };
});
