"use client";

import { usePathname } from "next/navigation";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";

export function canonicalPathname(pathname: string): string {
  // usePathname() returns the browser-visible locale prefix (for example
  // /en/manage), while the app routes live at /manage after proxy rewrite.
  return stripLocaleFromPathname(pathname);
}

export function useCanonicalPathname(): string {
  return canonicalPathname(usePathname() ?? "/");
}
