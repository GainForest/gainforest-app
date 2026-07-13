import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { resolveSupportedLanguage } from "@/lib/i18n/languages";
import { getLocalizedPathnames, withLocalePrefix } from "@/lib/i18n/routing";

const SOCIAL_IMAGE = "/og/gainforest-og-2.png";

export async function localizedAlternates(
  pathname: string,
): Promise<NonNullable<Metadata["alternates"]>> {
  const locale = resolveSupportedLanguage(await getLocale());

  return {
    canonical: withLocalePrefix(pathname, locale),
    languages: {
      ...getLocalizedPathnames(pathname),
      "x-default": pathname,
    },
  };
}

export function socialPreviewMetadata(
  pathname: string,
  title: string,
  description: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      title,
      description,
      url: pathname,
      type: "website",
      images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: SOCIAL_IMAGE, alt: title }],
    },
  };
}
