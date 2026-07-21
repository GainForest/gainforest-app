"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { BinocularsIcon, Building2Icon, FolderKanbanIcon, MenuIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupManageBasePath, manageHref } from "@/lib/links";
import type { AuthSession } from "../../_lib/auth";
import { AuthButton } from "../AuthFlow";
import { CartHeaderButton } from "../cart/CartHeaderButton";
import { ChromeErrorBoundary } from "../ChromeErrorBoundary";
import { ProgressiveBlur } from "../ProgressiveBlur";
import { GlobalSearch } from "../GlobalSearch";
import { useHeaderSlots } from "../HeaderSlots";
import { NotificationBell } from "../NotificationBell";
import { useCollectAnimation } from "../rewards/collect-animation";
import { canonicalPathname } from "./paths";
import { AddObservationsButton, ManageContextLink } from "./context-actions";
import type { ManageAccountKind } from "./use-shell-session";

// The header action on each explore list page is a "My <records>" button
// that takes the signed-in viewer to the dedicated management page for those
// records (e.g. /projects -> Manage Projects). Projects / certs / observations
// open the active account context's manage list (personal or organization,
// mirroring the Create buttons); organizations has a single cross-org manage
// list, so it uses a fixed href.
type MyRecordsManageSection = "projects" | "observations" | "bumicerts";

type MyRecordsRoute = {
  labelKey: "myProjects" | "myCerts" | "myObservations" | "myOrganizations";
  Icon: React.ComponentType<{ className?: string }>;
  // Open this manage section for the active account context...
  manageSection?: MyRecordsManageSection;
  // ...or navigate to a fixed manage route (organizations list).
  fixedHref?: string;
};

function myRecordsRouteForPath(pathname: string): MyRecordsRoute | null {
  switch (pathname) {
    case "/projects":
      return { labelKey: "myProjects", Icon: FolderKanbanIcon, manageSection: "projects" };
    case "/observations":
      return { labelKey: "myObservations", Icon: BinocularsIcon, manageSection: "observations" };
    case "/organizations":
      return { labelKey: "myOrganizations", Icon: Building2Icon, fixedHref: "/manage/organizations" };
    default:
      return null;
  }
}

function getRouteHeaderActions(pathname: string, authSession: AuthSession) {
  // Route header actions only have meaning for a signed-in viewer; hidden
  // otherwise (uploading observations and "My X" both require an account).
  if (!authSession.isLoggedIn) return null;
  // On the activity feed, surface a quick "Upload" entry point that opens the
  // add-observations modal over the current page.
  if (pathname === "/feed") return <FeedUploadHeaderButton sessionDid={authSession.did} />;
  const route = myRecordsRouteForPath(pathname);
  if (!route) return null;
  return <MyRecordsHeaderButton route={route} sessionDid={authSession.did} />;
}

function FeedUploadHeaderButton({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.headerActions");
  return (
    <AddObservationsButton sessionDid={sessionDid} className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
      <UploadIcon />
      <span className="hidden sm:inline">{t("upload")}</span>
    </AddObservationsButton>
  );
}

function MyRecordsHeaderButton({ route, sessionDid }: { route: MyRecordsRoute; sessionDid: string }) {
  const t = useTranslations("common.sidebar.headerActions");
  const { Icon } = route;
  const className = cn(buttonVariants({ variant: "default", size: "sm" }));
  const content = (
    <>
      <Icon />
      <span className="hidden sm:inline">{t(route.labelKey)}</span>
    </>
  );

  if (route.manageSection) {
    const section = route.manageSection;
    return (
      <ManageContextLink
        sessionDid={sessionDid}
        personalHref={manageHref({ basePath: "/manage" }, section)}
        personalHrefForDid={(did) => manageHref({ basePath: groupManageBasePath(did) }, section)}
        hrefForGroup={(identifier) => manageHref({ basePath: groupManageBasePath(identifier) }, section)}
        className={className}
      >
        {content}
      </ManageContextLink>
    );
  }

  return (
    <Link href={route.fixedHref ?? "/manage"} className={className}>
      {content}
    </Link>
  );
}

export function ShellHeader({
  authSession,
  profileName,
  manageAccountKind,
  onOpenMobileNav,
}: {
  authSession: AuthSession | null;
  profileName?: string | null;
  manageAccountKind: ManageAccountKind;
  onOpenMobileNav: () => void;
}) {
  const navT = useTranslations("common.navigation");
  const rawPathname = usePathname() ?? "/";
  const pathname = canonicalPathname(rawPathname);
  const { leftContent, rightContent, subHeaderContent } = useHeaderSlots();
  // Routes with a sub-header (e.g. the cert detail tab strip) get a more
  // opaque header backdrop so the extra row stays readable.
  const hasSubHeader = Boolean(subHeaderContent);
  const routeActions = getRouteHeaderActions(pathname, authSession ?? { isLoggedIn: false });
  // While the donor collects reward cards, the right-side widgets dissolve and
  // the account button widens into a "pocket" the cards get vacuumed into.
  const { phase: collectPhase, registerTarget, pulseKey } = useCollectAnimation();
  const collecting = collectPhase === "collecting";
  // A quick "gulp" heartbeat each time a card is swallowed into the pocket.
  const pocketControls = useAnimationControls();
  useEffect(() => {
    if (pulseKey === 0) return;
    // A soft two-stage heartbeat — swell, settle back with a little give.
    void pocketControls.start(
      {
        scale: [1, 1.22, 0.95, 1.03, 1],
        filter: ["blur(0px)", "blur(2.5px)", "blur(1px)", "blur(0px)", "blur(0px)"],
      },
      { duration: 0.6, ease: "easeOut", times: [0, 0.3, 0.6, 0.82, 1] },
    );
  }, [pulseKey, pocketControls]);

  return (
    <div className="sticky top-0 z-30" data-header>
      {/* Progressive blur background - same approach as the GainForest header. */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 z-1"
          style={{
            background: `linear-gradient(to bottom, var(--background) 0%,${hasSubHeader ? " var(--background) 80%," : ""} transparent 100%)`,
            opacity: 0.8,
          }}
        />
        <ProgressiveBlur position="top" height="100%" className="z-0" />
      </div>

      <div className="relative z-10 flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 gap-3">
          {/* Hamburger — mobile only, extreme left */}
          <Button
            type="button"
            onClick={onOpenMobileNav}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={navT("openNavigation")}
          >
            <MenuIcon />
          </Button>

          {/* Left slot */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <AnimatePresence mode="wait">
              {leftContent ? (
                <motion.div
                  key="left-content"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex-1 min-w-0"
                >
                  <ChromeErrorBoundary name="header-left-slot">{leftContent}</ChromeErrorBoundary>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Right slot */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Everything but the account button dissolves during a collect. */}
            <motion.div
              className="flex items-center gap-3"
              animate={collecting ? { opacity: 0, scale: 0.82, filter: "blur(8px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ type: "spring", stiffness: 90, damping: 22, mass: 1 }}
              style={{ pointerEvents: collecting ? "none" : "auto" }}
              aria-hidden={collecting}
            >
              <AnimatePresence mode="wait">
                {rightContent ?? routeActions ? (
                  <motion.div
                    key={rightContent ? "right-content" : `route-actions-${rawPathname}`}
                    initial={{ opacity: 0, x: 4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 4 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <ChromeErrorBoundary name="header-right-slot">{rightContent ?? routeActions}</ChromeErrorBoundary>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <ChromeErrorBoundary name="global-search">
                <GlobalSearch />
              </ChromeErrorBoundary>
              <ChromeErrorBoundary name="cart-button">
                <CartHeaderButton />
              </ChromeErrorBoundary>
              <ChromeErrorBoundary name="notification-bell">
                <NotificationBell session={authSession} />
              </ChromeErrorBoundary>
            </motion.div>

            {/* Account button — morphs into a rounded "pocket" during a collect
                and publishes its live position as the reward-card vacuum target.
                The outer wrapper carries the gulp heartbeat and is what the deck
                measures; the inner pill does the width morph. */}
            <div className="relative flex items-center">
              <motion.div
                ref={registerTarget}
                aria-hidden
                className="pointer-events-none absolute right-0 top-1/2"
                animate={pocketControls}
                style={{ y: "-50%", transformOrigin: "center" }}
              >
                <motion.div
                  className="relative h-9 overflow-hidden rounded-full border border-primary/40 bg-primary/15 shadow-[0_10px_34px_-8px_rgba(79,70,229,0.5)] backdrop-blur-md"
                  initial={false}
                  animate={{ width: collecting ? 224 : 36, opacity: collecting ? 1 : 0 }}
                  transition={{
                    width: { type: "spring", stiffness: 120, damping: 16, mass: 1.1 },
                    opacity: { duration: collecting ? 0.3 : 0.45, ease: "easeOut" },
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-70"
                    style={{
                      backgroundImage:
                        "linear-gradient(115deg, rgba(255,0,128,0.18), rgba(255,214,0,0.14), rgba(0,229,255,0.18), rgba(123,47,247,0.18))",
                    }}
                  />
                </motion.div>
              </motion.div>
              <div className="relative z-10">
                <ChromeErrorBoundary name="auth-button">
                  <AuthButton
                    session={authSession}
                    profileName={profileName}
                    isProfileNameLoading={profileName === undefined}
                    manageAccountKind={manageAccountKind}
                  />
                </ChromeErrorBoundary>
              </div>
            </div>
          </div>
        </div>

        {subHeaderContent ? (
          <motion.div
            key="sub-header"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden px-4 pb-1"
          >
            <ChromeErrorBoundary name="header-sub-slot">{subHeaderContent}</ChromeErrorBoundary>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

