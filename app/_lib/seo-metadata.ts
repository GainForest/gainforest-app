import type { Metadata } from "next";
import { getLocalizedPathnames } from "@/lib/i18n/routing";

const SOCIAL_IMAGE = "/og/gainforest-og-2.png";

export function localizedAlternates(pathname: string): NonNullable<Metadata["alternates"]> {
  return {
    canonical: pathname,
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
