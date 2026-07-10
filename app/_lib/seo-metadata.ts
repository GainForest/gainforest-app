import type { Metadata } from "next";
import { getLocalizedPathnames } from "@/lib/i18n/routing";

export function localizedAlternates(pathname: string): NonNullable<Metadata["alternates"]> {
  return {
    canonical: pathname,
    languages: {
      ...getLocalizedPathnames(pathname),
      "x-default": pathname,
    },
  };
}
