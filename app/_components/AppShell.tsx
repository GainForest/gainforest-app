"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  ArrowRightIcon,
  BinocularsIcon,
  Building2Icon,
  CheckIcon,
  CompassIcon,
  HeartHandshakeIcon,
  HeartIcon,
  LeafIcon,
  MapPinIcon,
  MenuIcon,
  MicIcon,
  MoonIcon,
  PlusIcon,
  RadioTowerIcon,
  SettingsIcon,
  Share2Icon,
  SparkleIcon,
  SunIcon,
  TreePineIcon,
  TrophyIcon,
  UserIcon,
} from "lucide-react";
import { Suspense, useEffect, useState, type MouseEvent, type SVGProps } from "react";
import type { AuthSession } from "../_lib/auth";
import packageJson from "@/package.json";
import { BumicertsBumicertCard, type BumicertsBumicertCardRecord } from "@/components/bumicert/BumicertsBumicertCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthButton, SignInPrompt } from "./AuthFlow";
import { HeaderSlotsProvider, useHeaderSlots } from "./HeaderSlots";

type NavLeaf = {
  kind: "leaf";
  id: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  pathCheck: { equals?: string; startsWith?: string };
};

type NavSection = {
  kind: "section";
  id: string;
  text: string;
  items: NavLeaf[];
};

type ManageAccountKind = "organization" | "user";

const NAV_ITEMS: NavSection[] = [
  {
    kind: "section",
    id: "marketplace",
    text: "EXPLORE",
    items: [
      {
        kind: "leaf",
        id: "bumicerts",
        text: "Bumicerts",
        Icon: CompassIcon,
        href: "/bumicerts",
        pathCheck: { startsWith: "/bumicerts" },
      },
      {
        kind: "leaf",
        id: "organizations",
        text: "Organizations",
        Icon: Building2Icon,
        href: "/organizations",
        pathCheck: { startsWith: "/organizations" },
      },
      {
        kind: "leaf",
        id: "leaderboard",
        text: "Leaderboard",
        Icon: TrophyIcon,
        href: "/leaderboard",
        pathCheck: { startsWith: "/leaderboard" },
      },
      {
        kind: "leaf",
        id: "observations",
        text: "Observations",
        Icon: BinocularsIcon,
        href: "/observations",
        pathCheck: { startsWith: "/observations" },
      },
      {
        kind: "leaf",
        id: "donations",
        text: "Donations",
        Icon: HeartHandshakeIcon,
        href: "/donations",
        pathCheck: { startsWith: "/donations" },
      },
      {
        kind: "leaf",
        id: "devices",
        text: "GainForest",
        Icon: RadioTowerIcon,
        href: "/devices",
        pathCheck: { startsWith: "/devices" },
      },
    ],
  },
];

const APP_VERSION = packageJson.version;

const RIPPLE_DURATION_MS = 1200;
const STORAGE_KEY = "bumicerts-theme";

type DocWithViewTransitions = Document & {
  startViewTransition?: (updateCallback: () => void) => { ready: Promise<void> };
};

type ShellSessionResponse = {
  session: AuthSession;
  manageAccountKind: ManageAccountKind;
};

export function AppShell({
  children,
  authSession,
  manageAccountKind,
}: {
  children: React.ReactNode;
  authSession: AuthSession | null;
  manageAccountKind: ManageAccountKind;
}) {
  const pathname = usePathname() ?? "/";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [resolvedAuthSession, setResolvedAuthSession] = useState<AuthSession | null>(authSession);
  const [resolvedManageAccountKind, setResolvedManageAccountKind] = useState<ManageAccountKind>(manageAccountKind);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<ShellSessionResponse> : null))
      .then((next) => {
        if (cancelled || !next) return;
        setResolvedAuthSession(next.session);
        setResolvedManageAccountKind(next.manageAccountKind);
      })
      .catch(() => {
        if (!cancelled) setResolvedAuthSession({ isLoggedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (pathname === "/") {
    return <>{children}</>;
  }

  return (
    <HeaderSlotsProvider>
      <div className="hidden md:flex h-screen overflow-hidden">
        <UnifiedSidebar authSession={resolvedAuthSession} manageAccountKind={resolvedManageAccountKind} />
        <main className="relative flex-1 overflow-y-auto">
          <Header authSession={resolvedAuthSession} onOpenMobileNav={() => setMobileNavOpen(true)} />
          {children}
        </main>
      </div>

      <div className="flex h-screen flex-col overflow-hidden md:hidden">
        <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <UnifiedSidebar authSession={resolvedAuthSession} manageAccountKind={resolvedManageAccountKind} />
        </MobileNavDrawer>
        <div className="relative flex-1 overflow-y-auto">
          <Header authSession={resolvedAuthSession} onOpenMobileNav={() => setMobileNavOpen(true)} />
          {children}
        </div>
      </div>
    </HeaderSlotsProvider>
  );
}

function UnifiedSidebar({ authSession, manageAccountKind }: { authSession: AuthSession | null; manageAccountKind: ManageAccountKind }) {
  return (
    <nav className="relative flex h-full w-[240px] flex-col overflow-hidden border-r border-border bg-foreground/3 p-4">
      <SidebarHeader />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <LayoutGroup id="unified-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavSection key={item.id} section={item} startIndex={0} />
          ))}
        </LayoutGroup>

        <div className="mt-auto flex flex-col gap-3 pt-4">
          {authSession?.isLoggedIn && <BumicertCreationCard />}

          <LayoutGroup id="unified-sidebar-nav-manage">
            <ManageSection authSession={authSession} manageAccountKind={manageAccountKind} />
          </LayoutGroup>
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <SocialFooter />
      </div>
    </nav>
  );
}

function SidebarHeader() {
  return (
    <div className="mb-4 flex w-full flex-col gap-2">
      <Link className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" href="/" aria-label="Bumicerts home">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.5,
            delay: 0.1,
            type: "spring",
            stiffness: 300,
            damping: 20,
          }}
          className="h-8 w-8 flex items-center justify-center shrink-0"
        >
          <Image
            src="/assets/media/images/app-icon.png"
            alt="Bumicerts"
            width={28}
            height={28}
            className="drop-shadow-md"
          />
        </motion.div>

        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.15,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="font-serif text-xl font-bold tracking-tight text-foreground"
        >
          Bumicerts
        </motion.span>
      </Link>
    </div>
  );
}

function NavSection({ section, startIndex }: { section: NavSection; startIndex: number }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="flex flex-col gap-1">
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.3,
          delay: 0.05 * startIndex,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        className="px-3 py-1"
      >
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          {section.text}
        </span>
      </motion.div>

      {/* Section items */}
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item, idx) => {
          const isActive = isLeafActive(item.pathCheck, pathname);
          return (
            <NavLeaf
              key={item.id}
              item={item}
              isActive={isActive}
              index={startIndex + idx + 1}
            />
          );
        })}
      </ul>
    </div>
  );
}

function NavLeaf({ item, isActive, index }: { item: NavLeaf; isActive: boolean; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: 0.05 * index,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <Link
        href={item.href}
        className="group block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <motion.div
          whileHover={{ x: 2 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            buttonVariants({ variant: isActive ? "default" : "ghost" }),
            "relative w-full justify-start pl-1",
            !isActive && "text-muted-foreground group-hover:text-primary hover:text-primary",
          )}
        >
          <span
            className={cn(
              "flex h-7 shrink-0 items-center justify-center rounded-full px-3 transition-colors",
              isActive ? "bg-primary-foreground text-primary" : "bg-primary/10 text-muted-foreground group-hover:text-primary",
            )}
          >
            <item.Icon className="h-4 w-4 shrink-0" />
          </span>
          <span className="flex-1 text-left">{item.text}</span>
        </motion.div>
      </Link>
    </motion.li>
  );
}

function BumicertCreationCard() {
  return (
    <div className="group flex flex-col w-full h-20 border border-border bg-background rounded-2xl p-1">
      <div className="flex-1 relative">
        {/*Left Big Sparkle*/}
        <SparkleIcon
          className="absolute bottom-2 left-4 size-6 rotate-30 opacity-50 group-hover:opacity-30 group-hover:scale-130 text-primary transition-all duration-300 animate-spin-slow"
          fill="currentcolor"
          strokeWidth={0}
        />
        {/*Left Small Sparkle*/}
        <SparkleIcon
          className="absolute bottom-1 left-12 size-3 rotate-60 opacity-30 group-hover:opacity-50 group-hover:scale-130 text-primary transition-all duration-300 animate-spin-slow"
          fill="currentcolor"
          strokeWidth={0}
        />
        {/*Right Big Sparkle*/}
        <SparkleIcon
          className="absolute bottom-2 right-2 size-6 rotate-60 opacity-50 group-hover:opacity-30 group-hover:scale-130 text-primary transition-all duration-300 animate-spin-slow"
          fill="currentcolor"
          strokeWidth={0}
        />
        {/*Right Small Sparkle*/}
        <SparkleIcon
          className="absolute bottom-1 right-10 size-3 rotate-30 opacity-30 group-hover:opacity-50 group-hover:scale-130 text-primary transition-all duration-300 animate-spin-slow"
          fill="currentcolor"
          strokeWidth={0}
        />
        {/*Hover Transitioning Bumicert Card*/}
        <div className="absolute z-1 -bottom-4 left-1/2 -translate-x-1/2 scale-100 group-hover:scale-120 -rotate-12 group-hover:-rotate-30 transition-transform bg-background/50 backdrop-blur-lg border border-border shadow-xl rounded-xl h-20 w-16 p-1 flex flex-col gap-1">
          <div className="w-full h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <LeafIcon className="text-primary size-6 opacity-80" />
          </div>
          <div className="bg-muted h-2 rounded-lg w-8"></div>
          <div className="bg-muted h-2 rounded-lg w-full"></div>
        </div>
      </div>

      {/*CTA*/}
      <Link
        href="/manage/bumicerts"
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "relative z-2 w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <PlusIcon /> Create a Bumicert
      </Link>
    </div>
  );
}

function ManageSection({
  authSession,
  manageAccountKind,
}: {
  authSession: AuthSession | null;
  manageAccountKind: ManageAccountKind;
}) {
  const pathname = usePathname() ?? "/";
  const organizationItems: NavLeaf[] = [
    {
      kind: "leaf",
      id: "organization",
      text: "Organization",
      Icon: Building2Icon,
      href: "/manage",
      pathCheck: { equals: "/manage" },
    },
    {
      kind: "leaf",
      id: "sites",
      text: "Sites",
      Icon: MapPinIcon,
      href: "/manage/sites",
      pathCheck: { startsWith: "/manage/sites" },
    },
    {
      kind: "leaf",
      id: "audio",
      text: "Audio",
      Icon: MicIcon,
      href: "/manage/audio",
      pathCheck: { startsWith: "/manage/audio" },
    },
    {
      kind: "leaf",
      id: "bumicerts-manage",
      text: "Bumicerts",
      Icon: BumicertIcon,
      href: "/manage/bumicerts",
      pathCheck: { startsWith: "/manage/bumicerts" },
    },
    {
      kind: "leaf",
      id: "trees",
      text: "Trees",
      Icon: TreePineIcon,
      href: "/manage/trees",
      pathCheck: { startsWith: "/manage/trees" },
    },
    {
      kind: "leaf",
      id: "settings",
      text: "Settings",
      Icon: SettingsIcon,
      href: "/manage/settings",
      pathCheck: { startsWith: "/manage/settings" },
    },
  ];
  const userItems: NavLeaf[] = [
    {
      kind: "leaf",
      id: "profile",
      text: "Profile",
      Icon: UserIcon,
      href: "/manage",
      pathCheck: { equals: "/manage" },
    },
    {
      kind: "leaf",
      id: "bumicerts-manage",
      text: "Bumicerts",
      Icon: BumicertIcon,
      href: "/manage/bumicerts",
      pathCheck: { startsWith: "/manage/bumicerts" },
    },
    {
      kind: "leaf",
      id: "settings",
      text: "Settings",
      Icon: SettingsIcon,
      href: "/manage/settings",
      pathCheck: { startsWith: "/manage/settings" },
    },
  ];
  const items: NavLeaf[] = authSession?.isLoggedIn
    ? manageAccountKind === "organization" ? organizationItems : userItems
    : [];

  return (
    <div className="flex flex-col gap-2">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: 0.3,
          delay: 0,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        className="px-3 py-1"
      >
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          MANAGE
        </span>
      </motion.div>

      {authSession == null ? (
        <ManageSectionSkeleton />
      ) : authSession.isLoggedIn ? (
        <ul className="flex flex-col gap-0.5">
          {items.map((item, index) => (
            <NavLeaf
              key={item.id}
              item={item}
              isActive={isLeafActive(item.pathCheck, pathname)}
              index={index + 1}
            />
          ))}
        </ul>
      ) : (
        <SignInPrompt />
      )}
    </div>
  );
}

function ManageSectionSkeleton() {
  return (
    <div className="space-y-2 px-3 py-1" aria-hidden="true">
      <div className="h-8 rounded-lg bg-muted/60" />
      <div className="h-8 rounded-lg bg-muted/40" />
    </div>
  );
}

function SocialFooter() {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-medium text-muted-foreground">Bumicerts v{APP_VERSION}</span>
      <ThemeToggle />
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

function getRouteHeaderActions(pathname: string, authSession: AuthSession) {
  if (pathname === "/bumicerts") {
    return <CreateBumicertHeaderButton isUnauthenticated={!authSession.isLoggedIn} />;
  }

  return null;
}

function CreateBumicertHeaderButton({ isUnauthenticated }: { isUnauthenticated: boolean }) {
  return (
    <Link href="/manage/bumicerts">
      <motion.span
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-sm font-medium px-3.5 py-1.5 transition-colors border",
          isUnauthenticated
            ? "border-border text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground border-transparent hover:bg-primary/90",
        )}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Create Bumicert</span>
      </motion.span>
    </Link>
  );
}

function Header({
  authSession,
  onOpenMobileNav,
}: {
  authSession: AuthSession | null;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const showBumicertTabs = isBumicertDetailPath(pathname);
  const { leftContent, rightContent, subHeaderContent } = useHeaderSlots();
  const routeActions = getRouteHeaderActions(pathname, authSession ?? { isLoggedIn: false });

  return (
    <div className="sticky top-0 z-30" data-header>
      {/* Progressive blur background - same approach as Bumicerts Header. */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 z-1"
          style={{
            background: `linear-gradient(to bottom, var(--background) 0%,${showBumicertTabs ? " var(--background) 80%," : ""} transparent 100%)`,
            opacity: 0.8,
          }}
        />
        <ProgressiveBlur position="top" height="100%" className="z-0" />
      </div>

      <div className="relative z-10 flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 gap-3">
          {/* Hamburger — mobile only, extreme left */}
          <motion.button
            type="button"
            onClick={onOpenMobileNav}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="md:hidden shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </motion.button>

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
                  {leftContent}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Right slot */}
          <div className="flex items-center gap-3 shrink-0">
            <AnimatePresence mode="wait">
              {rightContent ?? routeActions ? (
                <motion.div
                  key={rightContent ? "right-content" : `route-actions-${pathname}`}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {rightContent ?? routeActions}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <AuthButton session={authSession} />
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
            {subHeaderContent}
          </motion.div>
        ) : showBumicertTabs ? (
          <div className="overflow-hidden px-4 pb-1">
            <Suspense fallback={<BumicertHeaderTabsSkeleton />}>
              <BumicertHeaderTabs pathname={pathname} />
            </Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const BUMICERT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "site-boundaries", label: "Project Areas" },
  { id: "donations", label: "Donations" },
  { id: "timeline", label: "Timeline" },
] as const;

type BumicertDetailTab = (typeof BUMICERT_DETAIL_TABS)[number]["id"];

function isBumicertDetailPath(pathname: string): boolean {
  return /^\/bumicert\/[^/]+\/[^/]+\/?$/.test(pathname);
}

function parseBumicertTab(value: string | null): BumicertDetailTab {
  return BUMICERT_DETAIL_TABS.some((tab) => tab.id === value) ? (value as BumicertDetailTab) : "overview";
}

function bumicertTabHref(pathname: string, tab: BumicertDetailTab): string {
  if (tab === "overview") return pathname;
  return `${pathname}?${new URLSearchParams({ tab }).toString()}`;
}

const BUMICERT_HEADER_SUMMARY_EVENT = "bumicerts:bumicert-summary";

type BumicertHeaderSummary = {
  title: string;
  card: BumicertsBumicertCardRecord;
  donateHref: string;
};

type WindowWithBumicertSummary = Window & {
  __bumicertHeaderSummary?: BumicertHeaderSummary | null;
};

function BumicertHeaderTabs({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const activeTab = parseBumicertTab(searchParams.get("tab"));
  const [summary, setSummary] = useState<BumicertHeaderSummary | null>(null);

  useEffect(() => {
    const currentSummary = (window as WindowWithBumicertSummary).__bumicertHeaderSummary;
    setSummary(currentSummary ?? null);

    const handleSummary = (event: Event) => {
      const nextSummary = (event as CustomEvent<BumicertHeaderSummary | null>).detail;
      setSummary(nextSummary ?? null);
    };

    window.addEventListener(BUMICERT_HEADER_SUMMARY_EVENT, handleSummary);
    return () => window.removeEventListener(BUMICERT_HEADER_SUMMARY_EVENT, handleSummary);
  }, []);

  return (
    <div>
      {activeTab !== "overview" && summary ? (
        <BumicertHeaderAccordion summary={summary} overviewHref={bumicertTabHref(pathname, "overview")} />
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max items-end border-b border-border">
          {BUMICERT_DETAIL_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={bumicertTabHref(pathname, tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BumicertHeaderAccordion({
  summary,
  overviewHref,
}: {
  summary: BumicertHeaderSummary;
  overviewHref: string;
}) {
  const [copied, setCopied] = useState(false);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Accordion type="single" collapsible className="mb-1.5 rounded-2xl bg-secondary px-3 text-secondary-foreground">
      <AccordionItem value="bumicert-card" className="border-b-0">
        <AccordionTrigger className="min-w-0 py-2.5 text-base hover:no-underline">
          <span className="min-w-0 truncate text-sm font-medium sm:text-base">{summary.title}</span>
        </AccordionTrigger>
        <AccordionContent className="pt-1">
          <div className="mx-auto w-full max-w-[360px] space-y-3">
            <BumicertsBumicertCard record={summary.card} />
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleShare}>
                <AnimatePresence mode="wait" initial={false}>
                  {copied ? (
                    <motion.span
                      key="copied"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <CheckIcon className="h-3.5 w-3.5 text-primary" />
                      Copied!
                    </motion.span>
                  ) : (
                    <motion.span
                      key="share"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1.5"
                    >
                      <Share2Icon className="h-3.5 w-3.5" />
                      Share
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
              <Button asChild size="sm">
                <Link href={summary.donateHref}>
                  <HeartIcon className="h-3.5 w-3.5" />
                  Donate
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon-sm" aria-label="Go to overview tab">
                <Link href={overviewHref}>
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Overview</span>
                </Link>
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function BumicertHeaderTabsSkeleton() {
  return <div className="h-[42px] border-b border-border" />;
}

function MobileNavDrawer({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed top-0 left-0 bottom-0 z-50 md:hidden focus:outline-none bg-background"
            aria-label="Navigation"
          >
            {/* Render the full sidebar — identical to desktop */}
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function handleToggleTheme(event: MouseEvent<HTMLButtonElement>) {
    const targetTheme = isDark ? "light" : "dark";
    runThemeTransition(getEventOrigin(event), () => {
      document.documentElement.classList.toggle("dark", targetTheme === "dark");
      try {
        localStorage.setItem(STORAGE_KEY, targetTheme);
      } catch {
        // Storage can be disabled in private windows.
      }
      setIsDark(targetTheme === "dark");
    });
  }

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={handleToggleTheme}
      className={cn(
        "relative inline-flex h-7 w-12 items-center rounded-full border border-border bg-muted/70 p-0.5 text-muted-foreground transition-colors hover:text-foreground dark:border-input dark:bg-background/80",
        className,
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={mounted ? isDark : undefined}
      suppressHydrationWarning
    >
      <motion.span
        className="flex size-6 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/70 dark:bg-muted dark:ring-input"
        animate={{ x: mounted && isDark ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {mounted && isDark ? (
            <motion.span
              key="moon"
              initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <MoonIcon className="h-3.5 w-3.5" />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <SunIcon className="h-3.5 w-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </motion.button>
  );
}

function BumicertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none" {...props}>
      <rect x="88.1741" y="36.1741" width="318.652" height="439.812" rx="69.0614" stroke="currentColor" strokeWidth="36.3481" />
      <path d="M203.664 349.511C227.807 355.388 285.622 351.023 323.741 286.55C361.86 222.076 331.872 175.549 328.149 168.239" stroke="currentColor" strokeWidth="43.6177" strokeLinecap="round" />
      <path d="M319.385 165.16C295.171 159.586 237.415 164.673 200.105 229.618C162.795 294.563 193.362 340.712 197.177 347.975" stroke="currentColor" strokeWidth="43.6177" strokeLinecap="round" />
      <path d="M251.741 271.831C220.845 291.823 158.326 356.522 155.418 455.389" stroke="currentColor" strokeWidth="43.6177" strokeLinecap="round" />
    </svg>
  );
}

function isLeafActive(pathCheck: { equals?: string; startsWith?: string }, pathname: string): boolean {
  if (pathCheck.equals) return pathname === pathCheck.equals;
  if (pathCheck.startsWith) return pathname.startsWith(pathCheck.startsWith);
  return false;
}

function getEventOrigin(event: MouseEvent<HTMLButtonElement>) {
  if (event.detail > 0) return { originX: event.clientX, originY: event.clientY };

  const rect = event.currentTarget.getBoundingClientRect();
  return {
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
  };
}

function runThemeTransition(origin: { originX: number; originY: number }, updateTheme: () => void) {
  const doc = document as DocWithViewTransitions;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !doc.startViewTransition) {
    updateTheme();
    return;
  }

  const farthestX = Math.max(origin.originX, window.innerWidth - origin.originX);
  const farthestY = Math.max(origin.originY, window.innerHeight - origin.originY);
  const radius = Math.ceil(Math.hypot(farthestX, farthestY));

  document.documentElement.style.setProperty("--theme-ripple-x", `${origin.originX}px`);
  document.documentElement.style.setProperty("--theme-ripple-y", `${origin.originY}px`);

  const transition = doc.startViewTransition(updateTheme);

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${origin.originX}px ${origin.originY}px)`,
          `circle(0px at ${origin.originX}px ${origin.originY}px)`,
          `circle(${radius}px at ${origin.originX}px ${origin.originY}px)`,
        ],
        offset: [0, 0.06, 1],
      },
      {
        duration: RIPPLE_DURATION_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}

