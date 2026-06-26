"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  ArrowRightIcon,
  BinocularsIcon,
  Building2Icon,
  CheckIcon,
  CompassIcon,
  DroneIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  HeartIcon,
  LayoutDashboardIcon,
  LeafIcon,
  MapPinIcon,
  MenuIcon,
  MicIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  Share2Icon,
  SparkleIcon,
  SunIcon,
  TreePineIcon,
  TrophyIcon,
  UserIcon,
} from "lucide-react";
import { Suspense, useEffect, useState, type MouseEvent, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import type { AuthSession } from "../_lib/auth";
import packageJson from "@/package.json";
import { BumicertsBumicertCard, type BumicertsBumicertCardRecord } from "@/components/bumicert/BumicertsBumicertCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ACTIVE_MANAGE_CONTEXT_KEY,
  activeContextToManagePath,
  groupIdentifierFromManagePath,
  groupManageBasePath,
  manageHref,
} from "@/lib/links";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { AuthButton, SignInPrompt } from "./AuthFlow";
import {
  getAccountListSnapshot,
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../_lib/account-switcher";
import { ManageContextSwitcher } from "./ManageContextSwitcher";
import { HeaderSlotsProvider, useHeaderSlots } from "./HeaderSlots";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";

type NavLeaf = {
  kind: "leaf";
  id: string;
  text: string;
  Icon: React.ComponentType<{ className?: string }>;
  href: string;
  pathCheck: { equals?: string; startsWith?: string };
  tabCheck?: string;
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
        text: "Certs",
        Icon: BumicertIcon,
        href: "/certs",
        pathCheck: { startsWith: "/certs" },
      },
      {
        kind: "leaf",
        id: "projects",
        text: "Projects",
        Icon: FolderKanbanIcon,
        href: "/projects",
        pathCheck: { startsWith: "/projects" },
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
        id: "observations",
        text: "Observations",
        Icon: BinocularsIcon,
        href: "/observations",
        pathCheck: { startsWith: "/observations" },
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
        id: "bioblitz",
        text: "BioBlitz",
        Icon: LeafIcon,
        href: "/bioblitz",
        pathCheck: { startsWith: "/bioblitz" },
      },
      {
        kind: "leaf",
        id: "donations",
        text: "Donations",
        Icon: HeartHandshakeIcon,
        href: "/donations",
        pathCheck: { startsWith: "/donations" },
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
};

type ShellProfileResponse = {
  manageAccountKind: ManageAccountKind;
  profileName: string | null;
  hasCertifiedProfile?: boolean;
  hasCertifiedOrg?: boolean;
};

const ONBOARDING_PROMPT_MODAL_ID = "fresh-account-onboarding";
const ONBOARDING_PROMPT_SESSION_KEY_PREFIX = "gainforest:onboarding-prompt-shown:";
const shownOnboardingPromptKeys = new Set<string>();

function onboardingPromptSessionKey(did: string): string {
  return `${ONBOARDING_PROMPT_SESSION_KEY_PREFIX}${did}`;
}

function hasOnboardingPromptBeenShown(key: string): boolean {
  if (shownOnboardingPromptKeys.has(key)) return true;

  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markOnboardingPromptShown(key: string) {
  shownOnboardingPromptKeys.add(key);

  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // In-memory state still prevents repeat prompts when sessionStorage is unavailable.
  }
}

function readContextualManageBasePath(): string {
  if (typeof window === "undefined") return "/manage";
  return activeContextToManagePath(window.localStorage.getItem(ACTIVE_MANAGE_CONTEXT_KEY));
}

function canonicalPathname(pathname: string): string {
  // usePathname() returns the browser-visible locale prefix (for example
  // /en/manage), while the app routes live at /manage after proxy rewrite.
  return stripLocaleFromPathname(pathname);
}

function useCanonicalPathname(): string {
  return canonicalPathname(usePathname() ?? "/");
}

function useContextualManageBasePath(): string {
  const pathname = useCanonicalPathname();
  const groupIdentifier = groupIdentifierFromManagePath(pathname);
  // Keep the server render and the first client render identical. Reading
  // localStorage in the state initializer makes links hydrate as /manage on the
  // server but /manage/groups/... on the client when a group context is saved.
  const [basePath, setBasePath] = useState("/manage");

  useEffect(() => {
    if (groupIdentifier) return;

    const refresh = () => setBasePath(readContextualManageBasePath());
    refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_MANAGE_CONTEXT_KEY) refresh();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("gainforest-active-account-context", refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("gainforest-active-account-context", refresh);
    };
  }, [groupIdentifier]);

  return groupIdentifier ? groupManageBasePath(groupIdentifier) : basePath;
}

export function AppShell({
  children,
  authSession,
  manageAccountKind,
}: {
  children: React.ReactNode;
  authSession: AuthSession | null;
  manageAccountKind: ManageAccountKind;
}) {
  const pathname = useCanonicalPathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [resolvedAuthSession, setResolvedAuthSession] = useState<AuthSession | null>(authSession);
  const [resolvedManageAccountKind, setResolvedManageAccountKind] = useState<ManageAccountKind>(manageAccountKind);
  const [resolvedProfileName, setResolvedProfileName] = useState<string | null | undefined>(
    authSession?.isLoggedIn ? undefined : null,
  );
  const [hasCertifiedProfile, setHasCertifiedProfile] = useState<boolean>(true);
  const [isShellProfileLoading, setIsShellProfileLoading] = useState(authSession?.isLoggedIn === true);

  useEffect(() => {
    let cancelled = false;

    async function refreshShellSession() {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        const next = response.ok ? await response.json() as ShellSessionResponse : null;
        if (cancelled) return;

        const nextSession = next?.session ?? { isLoggedIn: false as const };
        setResolvedAuthSession(nextSession);

        if (!nextSession.isLoggedIn) {
          setResolvedManageAccountKind("user");
          setResolvedProfileName(null);
          setHasCertifiedProfile(true);
          setIsShellProfileLoading(false);
          return;
        }

        setResolvedProfileName(undefined);
        setHasCertifiedProfile(true);
        setIsShellProfileLoading(true);

        try {
          const profileResponse = await fetch("/api/session/profile", { cache: "no-store" });
          const profile = profileResponse.ok ? await profileResponse.json() as ShellProfileResponse : null;
          if (cancelled) return;

          if (!profile) {
            setResolvedManageAccountKind("user");
            setResolvedProfileName(null);
            setHasCertifiedProfile(true);
            setIsShellProfileLoading(false);
            return;
          }

          setResolvedManageAccountKind(profile.manageAccountKind);
          setResolvedProfileName(profile.profileName);
          setHasCertifiedProfile(profile.hasCertifiedProfile !== false);
          setIsShellProfileLoading(false);
        } catch {
          if (cancelled) return;
          setResolvedManageAccountKind("user");
          setResolvedProfileName(null);
          setHasCertifiedProfile(true);
          setIsShellProfileLoading(false);
        }
      } catch {
        if (cancelled) return;
        setResolvedAuthSession({ isLoggedIn: false });
        setResolvedManageAccountKind("user");
        setResolvedProfileName(null);
        setHasCertifiedProfile(true);
        setIsShellProfileLoading(false);
      }
    }

    void refreshShellSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (pathname === "/") {
    return <>{children}</>;
  }

  const isProfileLoading = resolvedAuthSession?.isLoggedIn === true && isShellProfileLoading;

  return (
    <HeaderSlotsProvider>
      <div className="flex h-screen overflow-hidden">
        <div className="hidden md:block">
          <UnifiedSidebar
            authSession={resolvedAuthSession}
            manageAccountKind={resolvedManageAccountKind}
            isProfileLoading={isProfileLoading}
          />
        </div>
        <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <UnifiedSidebar
            authSession={resolvedAuthSession}
            manageAccountKind={resolvedManageAccountKind}
            isProfileLoading={isProfileLoading}
          />
        </MobileNavDrawer>
        <main className="relative flex-1 overflow-y-auto">
          <Header authSession={resolvedAuthSession} profileName={resolvedProfileName} onOpenMobileNav={() => setMobileNavOpen(true)} />
          <FreshAccountOnboardingPrompt
            authSession={resolvedAuthSession}
            isProfileLoading={isProfileLoading}
            hasCertifiedProfile={hasCertifiedProfile}
          />
          {children}
        </main>
      </div>
    </HeaderSlotsProvider>
  );
}

function FreshAccountOnboardingPrompt({
  authSession,
  isProfileLoading,
  hasCertifiedProfile,
}: {
  authSession: AuthSession | null;
  isProfileLoading: boolean;
  hasCertifiedProfile: boolean;
}) {
  const modal = useModal();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const t = useTranslations("common.onboardingPrompt");

  useEffect(() => {
    if (!authSession?.isLoggedIn || isProfileLoading || hasCertifiedProfile) return;
    const promptSessionKey = onboardingPromptSessionKey(authSession.did);
    if (hasOnboardingPromptBeenShown(promptSessionKey)) return;

    const onboardingMode = new URLSearchParams(window.location.search).get("mode")?.startsWith("onboard") === true;
    if (onboardingMode) return;
    if (modal.stack.length > 0) return;

    markOnboardingPromptShown(promptSessionKey);

    modal.pushModal(
      {
        id: ONBOARDING_PROMPT_MODAL_ID,
        content: (
          <ModalContent dismissible={false} className="py-2">
            <div className="flex flex-col items-center pt-4 text-center">
              <motion.div
                className="relative h-20 w-20"
                transition={{ duration: 0.75, type: "spring" }}
                layoutId="gainforest-icon"
                initial={{ scale: 0.2, filter: "blur(20px)", opacity: 0 }}
                animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
              >
                <Image className="drop-shadow-2xl" src="/assets/media/images/app-icon.png" fill alt="GainForest" />
              </motion.div>
              <ModalTitle className="mt-4">{t("title")}</ModalTitle>
              <ModalDescription className="mt-1 max-w-sm">
                {t("description")}
              </ModalDescription>
              <ModalFooter className="mt-6 w-full">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    markOnboardingPromptShown(promptSessionKey);
                    void modal.hide().then(() => modal.clear());
                    router.push("/manage?mode=onboard-user");
                  }}
                >
                  {t("continue")}
                  <ArrowRightIcon />
                </Button>
              </ModalFooter>
            </div>
          </ModalContent>
        ),
      },
      true,
    );
    void modal.show();
  }, [authSession, hasCertifiedProfile, isProfileLoading, modal, pathname, router, t]);

  return null;
}

function UnifiedSidebar({
  authSession,
  manageAccountKind,
  isProfileLoading,
}: {
  authSession: AuthSession | null;
  manageAccountKind: ManageAccountKind;
  isProfileLoading: boolean;
}) {
  const pathname = useCanonicalPathname();
  const activeTab: SidebarTab = pathname.startsWith("/manage") ? "manage" : "explore";

  return (
    <nav className="relative isolate flex h-full w-[256px] flex-col overflow-hidden border-r border-border bg-foreground/3 p-4">
      <AnimatePresence>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-108 overflow-hidden"
        >
          {/* Ambient glow — present in both modes */}
          <div className="absolute -bottom-24 left-1/2 h-56 w-[160%] -translate-x-1/2 rounded-[50%] bg-primary/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/[0.12] blur-2xl" />
          {/* Mode-specific line art that bleeds off the bottom edge */}
          {activeTab === "manage" ? <ManageArt /> : <ExploreArt />}
        </motion.div>
      </AnimatePresence>

      <SidebarHeader />

      <div className="mt-2">
        <SidebarTabs activeTab={activeTab} />
      </div>

      {authSession?.isLoggedIn ? (
        <div className="mt-3">
          <ManageContextSwitcher sessionDid={authSession.did} />
        </div>
      ) : null}

      <div className="mt-3 border-t border-border" />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 pt-3">
        {activeTab === "explore" ? (
          <>
            <LayoutGroup id="unified-sidebar-nav">
              <ExploreNav />
            </LayoutGroup>

            <div className="mt-auto flex flex-col gap-3 pt-4">
              {authSession?.isLoggedIn ? <BumicertCreationCard sessionDid={authSession.did} /> : <SignInPrompt />}
            </div>
          </>
        ) : (
          <LayoutGroup id="unified-sidebar-nav-manage">
            <Suspense fallback={<ManageSectionSkeleton />}>
              <ManageSection
                authSession={authSession}
                manageAccountKind={manageAccountKind}
                isProfileLoading={isProfileLoading}
              />
            </Suspense>
          </LayoutGroup>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <SocialFooter />
      </div>
    </nav>
  );
}

type SidebarTab = "explore" | "manage";

const SIDEBAR_TABS: {
  id: SidebarTab;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "explore", label: "Explore", href: "/certs", Icon: CompassIcon },
  { id: "manage", label: "Manage", href: "/manage", Icon: LayoutDashboardIcon },
];

function SidebarTabs({ activeTab }: { activeTab: SidebarTab }) {
  const manageBasePath = useContextualManageBasePath();
  const t = useTranslations("common.sidebar.tabs");
  return (
    <LayoutGroup id="sidebar-tabs">
      <div className="flex rounded-full border border-border bg-foreground/5 p-1">
        {SIDEBAR_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={tab.id === "manage" ? manageBasePath : tab.href}
              aria-current={isActive ? "page" : undefined}
              className="relative flex-1 rounded-full px-3 py-1.5 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {isActive ? (
                <motion.span
                  layoutId="sidebar-tab-active"
                  className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-border"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex items-center justify-center gap-1.5 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.Icon className="h-4 w-4 shrink-0 opacity-50" />
                {t(tab.id)}
              </span>
            </Link>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function ExploreNav() {
  const pathname = useCanonicalPathname();
  const t = useTranslations("common.sidebar.items");
  const items = NAV_ITEMS.flatMap((section) => section.items);

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item, index) => (
        <NavLeaf
          key={item.id}
          item={{ ...item, text: t(item.id) }}
          isActive={isLeafActive(item.pathCheck, pathname)}
          index={index + 1}
        />
      ))}
    </ul>
  );
}

function SidebarHeader() {
  return (
    <div className="mb-4 flex w-full flex-col gap-2">
      <Link className="flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" href="/" aria-label="GainForest home">
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
            alt="GainForest"
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
          GainForest
        </motion.span>
      </Link>
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

const ONBOARD_ORGANIZATION_HREF = "/manage?mode=onboard-org";

function createProjectHrefForGroup(identifier: string): string {
  return manageHref({ basePath: groupManageBasePath(identifier) }, "projects", { mode: "new" });
}

function CreateProjectLink({
  sessionDid,
  className,
  children,
}: {
  sessionDid: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!sessionDid) {
    return (
      <Link href={manageHref({ basePath: "/manage" }, "projects", { mode: "new" })} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <AuthenticatedCreateProjectLink sessionDid={sessionDid} className={className}>
      {children}
    </AuthenticatedCreateProjectLink>
  );
}

function AuthenticatedCreateProjectLink({
  sessionDid,
  className,
  children,
}: {
  sessionDid: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { groups, reload } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  const activeGroup = activeContext.type === "group" ? groups.find((group) => group.groupDid === activeContext.did) ?? null : null;
  const href = activeContext.type === "group"
    ? createProjectHrefForGroup(activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did)
    : groups[0]
      ? createProjectHrefForGroup(switcherGroupIdentifier(groups[0]))
      : ONBOARD_ORGANIZATION_HREF;

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();

    if (activeContext.type === "group") {
      const identifier = activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did;
      if (activeGroup) {
        setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
      }
      router.push(createProjectHrefForGroup(identifier));
      return;
    }

    let nextGroups = groups;
    if (nextGroups.length === 0) {
      await reload();
      const latest = getAccountListSnapshot();
      if (latest.sessionDid === sessionDid) nextGroups = latest.groups;
    }

    const firstGroup = nextGroups[0];
    if (!firstGroup) {
      router.push(ONBOARD_ORGANIZATION_HREF);
      return;
    }

    const identifier = switcherGroupIdentifier(firstGroup);
    setActiveContext({ type: "group", did: firstGroup.groupDid, identifier, role: firstGroup.role });
    router.push(createProjectHrefForGroup(identifier));
  };

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

function BumicertCreationCard({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.creationCard");
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
      <CreateProjectLink
        sessionDid={sessionDid}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "relative z-2 w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <PlusIcon /> {t("createProject")}
      </CreateProjectLink>
    </div>
  );
}

function ManageSection({
  authSession,
  manageAccountKind,
  isProfileLoading,
}: {
  authSession: AuthSession | null;
  manageAccountKind: ManageAccountKind;
  isProfileLoading: boolean;
}) {
  const pathname = useCanonicalPathname();
  const searchParams = useSearchParams();
  const t = useTranslations("common.sidebar.items");
  const groupIdentifier = groupIdentifierFromManagePath(pathname);
  const isGroupManageContext = Boolean(groupIdentifier);
  const basePath = groupIdentifier ? groupManageBasePath(groupIdentifier) : "/manage";
  const resolvedAccountKind = isGroupManageContext ? "organization" : manageAccountKind;

  const organizationItems: NavLeaf[] = [
    {
      kind: "leaf",
      id: "organization",
      text: isGroupManageContext ? t("organizationHome") : t("myOrganization"),
      Icon: Building2Icon,
      href: basePath,
      pathCheck: { equals: basePath },
    },
    // "My Organizations" is the cross-org switcher — hidden once you're scoped
    // into a single organization's manage section.
    ...(isGroupManageContext
      ? []
      : [
          {
            kind: "leaf" as const,
            id: "organizations-manage",
            text: t("myOrganizations"),
            Icon: Building2Icon,
            href: "/manage/organizations",
            pathCheck: { startsWith: "/manage/organizations" },
          },
        ]),
    {
      kind: "leaf",
      id: "sites",
      text: t("mySites"),
      Icon: MapPinIcon,
      href: manageHref({ basePath }, "sites"),
      pathCheck: { startsWith: manageHref({ basePath }, "sites") },
    },
    {
      kind: "leaf",
      id: "audio",
      text: t("myAudio"),
      Icon: MicIcon,
      href: manageHref({ basePath }, "audio"),
      pathCheck: { startsWith: manageHref({ basePath }, "audio") },
    },
    {
      kind: "leaf",
      id: "drone",
      text: t("myDrone"),
      Icon: DroneIcon,
      href: manageHref({ basePath }, "drone"),
      pathCheck: { startsWith: manageHref({ basePath }, "drone") },
    },
    {
      kind: "leaf",
      id: "projects-manage",
      text: t("myProjects"),
      Icon: FolderKanbanIcon,
      href: manageHref({ basePath }, "projects"),
      pathCheck: { startsWith: manageHref({ basePath }, "projects") },
    },
    {
      kind: "leaf",
      id: "observations-manage",
      text: t("myObservations"),
      Icon: BinocularsIcon,
      href: manageHref({ basePath }, "observations"),
      pathCheck: { startsWith: manageHref({ basePath }, "observations") },
    },
    {
      kind: "leaf",
      id: "trees",
      text: t("myTrees"),
      Icon: TreePineIcon,
      href: manageHref({ basePath }, "trees"),
      pathCheck: { startsWith: manageHref({ basePath }, "trees") },
    },
    {
      kind: "leaf",
      id: "settings",
      text: t("settings"),
      Icon: SettingsIcon,
      href: manageHref({ basePath }, "settings"),
      pathCheck: { startsWith: manageHref({ basePath }, "settings") },
    },
  ];
  const userItems: NavLeaf[] = [
    {
      kind: "leaf",
      id: "profile",
      text: t("myProfile"),
      Icon: UserIcon,
      href: basePath,
      pathCheck: { equals: basePath },
    },
    {
      kind: "leaf",
      id: "organizations-manage",
      text: t("myOrganizations"),
      Icon: Building2Icon,
      href: "/manage/organizations",
      pathCheck: { startsWith: "/manage/organizations" },
    },
    {
      kind: "leaf",
      id: "settings",
      text: t("settings"),
      Icon: SettingsIcon,
      href: manageHref({ basePath }, "settings"),
      pathCheck: { startsWith: manageHref({ basePath }, "settings") },
    },
  ];
  const items: NavLeaf[] = authSession?.isLoggedIn
    ? resolvedAccountKind === "organization" ? organizationItems : userItems
    : [];

  return (
    <div className="flex flex-col gap-2">
      {authSession == null || isProfileLoading ? (
        <ManageSectionSkeleton />
      ) : authSession.isLoggedIn ? (
        <ul className="flex flex-col gap-0.5">
          {items.map((item, index) => (
            <NavLeaf
              key={item.id}
              item={item}
              isActive={isManageLeafActive(item, pathname, searchParams.get("tab"))}
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
  // Mirrors the real <ul className="flex flex-col gap-0.5"> of NavLeaf rows:
  // each row is an h-9 button-shaped pill with a leading h-7 icon chip and a
  // label bar. Account kind isn't known yet, so we show a representative count.
  const labelWidths = ["w-24", "w-16", "w-20", "w-16"];
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden="true">
      {labelWidths.map((width, index) => (
        <li key={index} className="flex h-9 items-center gap-2 pl-1">
          <Skeleton className="sidebar-skeleton h-7 w-[42px] shrink-0 rounded-full" />
          <Skeleton className={`sidebar-skeleton h-3.5 rounded-full ${width}`} />
        </li>
      ))}
    </ul>
  );
}

function SocialFooter() {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-medium text-muted-foreground">GainForest v{APP_VERSION}</span>
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
  if (pathname === "/certs") {
    return <CreateBumicertHeaderButton authSession={authSession} />;
  }

  return null;
}

function CreateBumicertHeaderButton({ authSession }: { authSession: AuthSession }) {
  const t = useTranslations("common.sidebar.creationCard");
  return (
    <CreateProjectLink
      sessionDid={authSession.isLoggedIn ? authSession.did : null}
      className={cn(buttonVariants({ variant: authSession.isLoggedIn ? "default" : "outline", size: "sm" }))}
    >
      <PlusIcon />
      <span className="hidden sm:inline">{t("createProject")}</span>
    </CreateProjectLink>
  );
}

function Header({
  authSession,
  profileName,
  onOpenMobileNav,
}: {
  authSession: AuthSession | null;
  profileName?: string | null;
  onOpenMobileNav: () => void;
}) {
  const rawPathname = usePathname() ?? "/";
  const pathname = canonicalPathname(rawPathname);
  const showBumicertTabs = isBumicertDetailPath(pathname);
  const { leftContent, rightContent, subHeaderContent } = useHeaderSlots();
  const routeActions = getRouteHeaderActions(pathname, authSession ?? { isLoggedIn: false });

  return (
    <div className="sticky top-0 z-30" data-header>
      {/* Progressive blur background - same approach as the GainForest header. */}
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
          <Button
            type="button"
            onClick={onOpenMobileNav}
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open navigation"
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
                  key={rightContent ? "right-content" : `route-actions-${rawPathname}`}
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  {rightContent ?? routeActions}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <LanguageSelector />
            <AuthButton session={authSession} profileName={profileName} isProfileNameLoading={profileName === undefined} />
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
              <BumicertHeaderTabs pathname={rawPathname} />
            </Suspense>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const BUMICERT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "site-boundaries", label: "Site Boundaries" },
  { id: "reviews", label: "Reviews" },
  { id: "donations", label: "Donations" },
  { id: "timeline", label: "Timeline" },
] as const;

type BumicertDetailTab = (typeof BUMICERT_DETAIL_TABS)[number]["id"];

function isBumicertDetailPath(pathname: string): boolean {
  return /^\/cert\/[^/]+\/[^/]+\/?$/.test(pathname);
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
        <div className={activeTab === "timeline" ? undefined : "lg:hidden"}>
          <BumicertHeaderAccordion summary={summary} overviewHref={bumicertTabHref(pathname, "overview")} />
        </div>
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
  // Mirrors the real tab strip: a bottom-bordered row of px-4 py-2.5 tab links,
  // one bar per BUMICERT_DETAIL_TABS entry sized to its label.
  const tabWidths = ["w-16", "w-24", "w-20", "w-16"];
  return (
    <div className="-mx-4 overflow-x-auto px-4" aria-hidden="true">
      <div className="flex min-w-max items-end border-b border-border">
        {tabWidths.map((width, index) => (
          <div key={index} className="flex items-center px-4 py-2.5">
            <Skeleton className={`h-4 rounded-full ${width}`} />
          </div>
        ))}
      </div>
    </div>
  );
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
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleToggleTheme}
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={mounted ? isDark : undefined}
      suppressHydrationWarning
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
            <MoonIcon />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <SunIcon />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
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

function ExploreArt() {
  // Two climbing vines hugging either edge — growth creeping up the sides of
  // the sidebar.
  return (
    <>
      <Vine side="left" className="bottom-0 left-0 h-26 w-5" />
      <Vine side="right" className="bottom-0 right-0 h-26 w-5" />
    </>
  );
}

function Vine({ side, className }: { side: "left" | "right"; className?: string }) {
  // Drawn once for the left edge; the right edge mirrors it horizontally so
  // the leaves always curl inward toward the sidebar.
  return (
    <svg
      viewBox="0 0 60 240"
      fill="none"
      preserveAspectRatio="xMidYMax meet"
      className={cn("absolute text-primary", side === "right" && "-scale-x-100", className)}
    >
      {/* Winding stem climbing from the bottom edge */}
      <path
        d="M16 240 C 9 206 24 188 16 158 C 9 130 26 110 16 80 C 10 56 22 36 16 8"
        className="stroke-primary/30"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Leaves branching off, alternating sides of the stem */}
      <g className="fill-primary/20">
        <path d="M16 198 C 32 194 39 178 36 168 C 25 171 16 183 16 198 Z" />
        <path d="M16 150 C 2 147 -4 133 -1 124 C 11 127 16 138 16 150 Z" />
        <path d="M16 104 C 32 100 39 84 36 74 C 25 77 16 89 16 104 Z" />
        <path d="M16 58 C 2 55 -4 41 -1 32 C 11 35 16 46 16 58 Z" />
      </g>
    </svg>
  );
}

function ManageArt() {
  // A wild forest horizon: rolling hills with scattered pines.
  return (
    <svg
      className="absolute inset-x-0 bottom-0 w-full text-primary"
      viewBox="0 0 240 120"
      fill="none"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Far hill */}
      <path
        d="M0 78 C 44 58 84 74 120 66 C 168 56 204 66 240 76 L240 120 L0 120 Z"
        className="fill-primary/[0.06]"
      />
      {/* Near hill */}
      <path
        d="M0 100 C 52 84 92 98 140 92 C 188 86 216 96 240 100 L240 120 L0 120 Z"
        className="fill-primary/[0.11]"
      />
      {/* Scattered pines along the ridge */}
      <g className="fill-primary/20">
        <path d="M40 80 L33 96 L47 96 Z M40 70 L31 86 L49 86 Z" />
        <path d="M70 86 L65 98 L75 98 Z M70 78 L63 90 L77 90 Z" />
        <path d="M176 84 L170 98 L182 98 Z M176 75 L168 89 L184 89 Z" />
        <path d="M208 90 L203 100 L213 100 Z M208 83 L201 94 L215 94 Z" />
      </g>
    </svg>
  );
}

function isLeafActive(pathCheck: { equals?: string; startsWith?: string }, pathname: string): boolean {
  if (pathCheck.equals) return pathname === pathCheck.equals;
  if (pathCheck.startsWith) return pathname.startsWith(pathCheck.startsWith);
  return false;
}

function isManageLeafActive(item: NavLeaf, pathname: string, activeTab: string | null): boolean {
  if (item.tabCheck) return pathname === item.pathCheck.equals && activeTab === item.tabCheck;
  return isLeafActive(item.pathCheck, pathname) && !(pathname === "/manage" && activeTab === "settings");
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

