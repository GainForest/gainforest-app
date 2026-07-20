import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { resolveSupportedLanguage } from "@/lib/i18n/languages";
import { getCanonicalPathname, getSeoLocalizedPathnames } from "@/lib/i18n/routing";

const SOCIAL_IMAGE = "/og/gainforest-og-2.png";
const SITE_NAME = "GainForest";

export async function localizedAlternates(
  pathname: string,
): Promise<NonNullable<Metadata["alternates"]>> {
  const locale = resolveSupportedLanguage(await getLocale());

  return {
    canonical: getCanonicalPathname(pathname, locale),
    languages: {
      ...getSeoLocalizedPathnames(pathname),
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
      siteName: SITE_NAME,
      images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: "@gainforest",
      creator: "@gainforest",
      images: [{ url: SOCIAL_IMAGE, alt: title }],
    },
  };
}
