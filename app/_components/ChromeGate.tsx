"use client";

import { usePathname } from "next/navigation";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import type { AuthSession } from "../_lib/auth";
import { AppShell } from "./AppShell";
import { ChromeErrorBoundary } from "./ChromeErrorBoundary";
import { Footer } from "./Footer";

/**
 * Decides which chrome a route gets. The auth flow and the marketing landing
 * ("/") render without the app shell; every other route gets the sidebar +
 * header shell. The gate — not the shell — owns this decision, so the shell
 * can always mount its providers (HeaderSlots etc.) unconditionally.
 *
 * `authSession` is fetched server-side in the root layout and passed through,
 * so the shell paints with the real signed-in state on first render instead
 * of booting signed-out and correcting itself after a client fetch.
 */
export function ChromeGate({
  children,
  authSession,
}: {
  children: React.ReactNode;
  authSession: AuthSession;
}) {
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");

  if (pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  // BioBlitz is a single-screen dashboard meant to fit without scrolling, so it
  // omits the page footer (same treatment as the promo banner there). The
  // Globe is a full-bleed map view, so it drops the footer too.
  const showFooter = pathname !== "/bioblitz" && !pathname.startsWith("/globe");
  const footer = showFooter ? (
    <ChromeErrorBoundary name="footer">
      <Footer />
    </ChromeErrorBoundary>
  ) : null;
  const content = showFooter ? (
    <div className="flex min-h-full w-full flex-col [&>*]:shrink-0">
      {children}
      {footer}
    </div>
  ) : (
    <>{children}</>
  );

  // The landing page brings its own navigation and full-bleed layout.
  if (pathname === "/") {
    return showFooter ? (
      <div className="flex min-h-screen w-full flex-col [&>*]:shrink-0">
        {children}
        {footer}
      </div>
    ) : content;
  }

  return <AppShell authSession={authSession}>{content}</AppShell>;
}
