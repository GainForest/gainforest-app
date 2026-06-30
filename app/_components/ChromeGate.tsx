"use client";

import { usePathname } from "next/navigation";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { AppShell } from "./AppShell";
import { Footer } from "./Footer";

export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");

  if (pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  // BioBlitz is a single-screen dashboard meant to fit without scrolling, so it
  // omits the page footer (same treatment as the promo banner there).
  const showFooter = pathname !== "/bioblitz";

  return (
    <AppShell authSession={null} manageAccountKind="user" footer={showFooter ? <Footer /> : null}>
      {children}
    </AppShell>
  );
}
