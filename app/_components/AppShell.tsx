"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthSession } from "../_lib/auth";
import { BioblitzPromoBanner } from "./BioblitzPromoBanner";
import { FloatingTainaGuide } from "./FloatingTainaGuide";
import { ChromeErrorBoundary } from "./ChromeErrorBoundary";
import { HeaderSlotsProvider } from "./HeaderSlots";
import { MobileNavDrawer } from "./shell/MobileNavDrawer";
import { MobileNavProvider } from "./shell/mobile-nav-context";
import { FreshAccountOnboardingPrompt } from "./shell/OnboardingPrompt";
import { ShellHeader } from "./shell/ShellHeader";
import { SidebarCollapseToggle, UnifiedSidebar } from "./shell/UnifiedSidebar";
import { useCanonicalPathname } from "./shell/paths";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./shell/sidebar-context";
import { useShellSession } from "./shell/use-shell-session";

/**
 * The app chrome: sidebar + header around every non-landing, non-auth route
 * (ChromeGate decides which routes get it). The shell itself is a thin
 * orchestrator — the widgets live in ./shell/* and each one is isolated
 * behind a ChromeErrorBoundary so a crash degrades to a missing widget
 * instead of a dead page.
 */
export function AppShell({
  children,
  authSession,
}: {
  children: React.ReactNode;
  // Resolved server-side in the root layout, so the shell's first paint
  // already reflects the real signed-in state.
  authSession: AuthSession;
}) {
  const pathname = useCanonicalPathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const session = useShellSession(authSession);
  const isGlobe = pathname.startsWith("/globe");
  // Published to full-bleed routes (the Globe) that hide the ShellHeader but
  // still need to open the nav drawer from their own header.
  const mobileNav = useMemo(() => ({ open: () => setMobileNavOpen(true) }), []);

  useEffect(() => {
    if (isGlobe) {
      setSidebarCollapsed(true);
      return;
    }

    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      // Ignore storage access errors (private windows).
    }
  }, [isGlobe]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Private windows can block storage; in-memory state still works.
      }
      return next;
    });
  };

  return (
    <HeaderSlotsProvider>
      <MobileNavProvider value={mobileNav}>
      <div className="flex h-screen flex-col overflow-hidden">
        {pathname !== "/bioblitz" && !isGlobe ? (
          <ChromeErrorBoundary name="bioblitz-banner">
            <BioblitzPromoBanner />
          </ChromeErrorBoundary>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative hidden md:block">
            <ChromeErrorBoundary name="sidebar">
              <UnifiedSidebar authSession={session.authSession} collapsed={sidebarCollapsed} />
              <SidebarCollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            </ChromeErrorBoundary>
          </div>
          <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <ChromeErrorBoundary name="mobile-sidebar">
              <UnifiedSidebar authSession={session.authSession} />
            </ChromeErrorBoundary>
          </MobileNavDrawer>
          <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
            {!isGlobe ? (
              <ShellHeader
                authSession={session.authSession}
                profileName={session.profileName}
                manageAccountKind={session.manageAccountKind}
                onOpenMobileNav={() => setMobileNavOpen(true)}
              />
            ) : null}
            <ChromeErrorBoundary name="onboarding-prompt">
              <FreshAccountOnboardingPrompt
                authSession={session.authSession}
                isProfileLoading={session.isProfileLoading}
                hasCertifiedProfile={session.hasCertifiedProfile}
              />
            </ChromeErrorBoundary>
            {children}
          </main>
        </div>
        <ChromeErrorBoundary name="floating-taina">
          <FloatingTainaGuide />
        </ChromeErrorBoundary>
      </div>
      </MobileNavProvider>
    </HeaderSlotsProvider>
  );
}
