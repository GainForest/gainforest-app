"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BinocularsIcon, Building2Icon, FolderKanbanIcon, MenuIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupManageBasePath, manageHref } from "@/lib/links";
import type { AuthSession } from "../../_lib/auth";
import { AuthButton } from "../AuthFlow";
import { ChromeErrorBoundary } from "../ChromeErrorBoundary";
import { GlobalSearch } from "../GlobalSearch";
import { useHeaderSlots } from "../HeaderSlots";
import { NotificationBell } from "../NotificationBell";
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
            <ChromeErrorBoundary name="notification-bell">
              <NotificationBell session={authSession} />
            </ChromeErrorBoundary>
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

function ProgressiveBlur({
  className,
  height = "30%",
  position = "bottom",
  blurLevels = [1, 4, 10, 20],
}: {
  className?: string;
  height?: string;
  position?: "top" | "bottom" | "both";
  blurLevels?: number[];
}) {
  const renderStack = (stackPosition: "top" | "bottom") => {
    const direction = stackPosition === "top" ? "to top" : "to bottom";
    const step = 100 / (blurLevels.length + 1);

    return blurLevels.map((blur, index) => {
      const fadeStart = index * step;
      const fadeEnd = (index + 1) * step;
      const mask = `linear-gradient(${direction}, transparent ${fadeStart}%, #000 ${fadeEnd}%)`;

      return (
        <span
          key={`${stackPosition}-${index}`}
          style={{
            gridArea: "1 / 1",
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        />
      );
    });
  };

  if (position === "both") {
    return (
      <>
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 grid", className)} style={{ height }}>
          {renderStack("top")}
        </div>
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-10 grid", className)} style={{ height }}>
          {renderStack("bottom")}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 grid",
        position === "top" ? "top-0" : "bottom-0",
        className,
      )}
      style={{ height }}
    >
      {renderStack(position)}
    </div>
  );
}
