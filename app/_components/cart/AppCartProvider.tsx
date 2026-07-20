"use client";

import { usePathname } from "next/navigation";
import { SUPPORTED_LOCALES } from "@/lib/i18n/languages";
import { CartProvider } from "./CartProvider";

const localeSegments = new Set<string>(SUPPORTED_LOCALES);

function isTestRegistryPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "_test") return true;
  return localeSegments.has(segments[0] ?? "") && segments[1] === "_test";
}

/**
 * App-level cart boundary. The public /_test registry must never read or
 * rewrite a visitor's persisted production cart, even before its nested
 * experience providers mount.
 */
export function AppCartProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <CartProvider persistence={isTestRegistryPath(pathname) ? "memory" : "local"}>
      {children}
    </CartProvider>
  );
}
