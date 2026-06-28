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
  ChevronLeftIcon,
  FolderKanbanIcon,
  HeartHandshakeIcon,
  HeartIcon,
  LeafIcon,
  Loader2Icon,
  MenuIcon,
  MoonIcon,
  NewspaperIcon,
  PlusIcon,
  Share2Icon,
  SparkleIcon,
  SunIcon,
  UploadIcon,
  UserIcon,
} from "lucide-react";
import { createContext, Suspense, useContext, useEffect, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import type { AuthSession } from "../_lib/auth";
import { BioblitzPromoBanner } from "./BioblitzPromoBanner";
import packageJson from "@/package.json";
import { BumicertsBumicertCard, type BumicertsBumicertCardRecord } from "@/components/bumicert/BumicertsBumicertCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  groupManageBasePath,
  groupManageTarget,
  manageApiHref,
  manageHref,
  personalManageTarget,
  type ManageTarget,
} from "@/lib/links";
import { PROJECTS_CHANGED_EVENT, notifyProjectsChanged } from "../_lib/projects-events";
import dynamic from "next/dynamic";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { AuthButton, SignInPrompt } from "./AuthFlow";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../_lib/account-switcher";
import { HeaderSlotsProvider, useHeaderSlots } from "./HeaderSlots";
import { GlobalSearch } from "./GlobalSearch";
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
    id: "explore",
    text: "EXPLORE",
    items: [
      {
        kind: "leaf",
        id: "feed",
        text: "Feed",
        Icon: NewspaperIcon,
        href: "/feed",
        pathCheck: { startsWith: "/feed" },
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
    ],
  },
  {
    kind: "section",
    id: "funding",
    text: "FUNDING",
    items: [
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

const SIDEBAR_COLLAPSED_STORAGE_KEY = "gainforest-sidebar-collapsed";
const SidebarCollapsedContext = createContext(false);
function useSidebarCollapsed(): boolean {
  return useContext(SidebarCollapsedContext);
}

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

function canonicalPathname(pathname: string): string {
  // usePathname() returns the browser-visible locale prefix (for example
  // /en/manage), while the app routes live at /manage after proxy rewrite.
  return stripLocaleFromPathname(pathname);
}

function useCanonicalPathname(): string {
  return canonicalPathname(usePathname() ?? "/");
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1");
    } catch {
      // Ignore storage access errors (private windows).
    }
  }, []);

  if (pathname === "/") {
    return <>{children}</>;
  }

  const isProfileLoading = resolvedAuthSession?.isLoggedIn === true && isShellProfileLoading;

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
      <div className="flex h-screen flex-col overflow-hidden">
        {pathname !== "/bioblitz" ? <BioblitzPromoBanner /> : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative hidden md:block">
            <UnifiedSidebar
              authSession={resolvedAuthSession}
              collapsed={sidebarCollapsed}
            />
            <SidebarCollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
          </div>
          <MobileNavDrawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <UnifiedSidebar authSession={resolvedAuthSession} />
          </MobileNavDrawer>
          <main className="relative flex-1 overflow-y-auto">
            <Header
              authSession={resolvedAuthSession}
              profileName={resolvedProfileName}
              manageAccountKind={resolvedManageAccountKind}
              onOpenMobileNav={() => setMobileNavOpen(true)}
            />
            <FreshAccountOnboardingPrompt
              authSession={resolvedAuthSession}
              isProfileLoading={isProfileLoading}
              hasCertifiedProfile={hasCertifiedProfile}
            />
            {children}
          </main>
        </div>
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

/** Wraps a trigger with a right-anchored tooltip, but only when the sidebar is
 *  collapsed to an icon rail (otherwise the label is already visible). */
function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const collapsed = useSidebarCollapsed();
  if (!collapsed) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Circular chevron that straddles the sidebar's right edge to collapse/expand. */
function SidebarCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations("common.sidebar");
  const label = collapsed ? t("expand") : t("collapse");
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            aria-label={label}
            aria-expanded={!collapsed}
            className="absolute -right-3 top-7 z-40 grid size-6 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronLeftIcon className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", collapsed && "rotate-180")} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function UnifiedSidebar({
  authSession,
  collapsed = false,
}: {
  authSession: AuthSession | null;
  collapsed?: boolean;
}) {
  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
    <nav
      className={cn(
        "relative isolate z-30 flex h-full flex-col border-r border-border bg-foreground/3 transition-[width,padding] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
        collapsed ? "w-[76px] overflow-visible p-3" : "w-[256px] overflow-hidden p-4",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-108 overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute -bottom-24 left-1/2 h-56 w-[160%] -translate-x-1/2 rounded-[50%] bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/[0.12] blur-2xl" />
        {/* Climbing-vine line art that bleeds off the bottom edge */}
        <ExploreArt />
      </div>

      <SidebarHeader />

      <div className="mt-3 border-t border-border" />

      <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3", collapsed ? "overflow-x-hidden" : "pr-1")}>
        {authSession?.isLoggedIn ? <SidebarProfileRow did={authSession.did} /> : null}
        <LayoutGroup id="unified-sidebar-nav">
          <ExploreNav />
        </LayoutGroup>

        <div className="mt-auto flex flex-col gap-3 pt-4">
          {authSession?.isLoggedIn ? (
            <>
              <BumicertCreationCard sessionDid={authSession.did} />
              <AddObservationsCard sessionDid={authSession.did} />
            </>
          ) : (
            <SignInPrompt collapsed={collapsed} />
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <SocialFooter />
      </div>
    </nav>
    </SidebarCollapsedContext.Provider>
  );
}

function SidebarProfileRow({ did }: { did: string }) {
  const t = useTranslations("common.sidebar.profileRow");
  const collapsed = useSidebarCollapsed();
  const { personal, groups } = useAccountList(did);
  const [activeContext] = useActiveAccountContext(did);

  // Reflect the account selected in the top-right switcher: when an
  // organization context is active, show that org's name/avatar and link to its
  // profile; otherwise fall back to the signed-in personal account.
  const activeGroup = activeContext.type === "group"
    ? groups.find((group) => group.groupDid === activeContext.did) ?? null
    : null;
  const isGroup = activeGroup != null;
  const card = activeGroup ?? personal;

  const name = card?.displayName?.trim() || t("fallbackName");
  const identifier = activeGroup ? switcherGroupIdentifier(activeGroup) : card?.handle?.trim() || did;
  const href = `/account/${encodeURIComponent(identifier)}`;
  const avatarUrl = card?.avatarUrl ?? null;

  return (
    <SidebarTooltip label={name}>
      <Link
        href={href}
        aria-label={collapsed ? name : t("viewProfile")}
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "group w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          collapsed ? "h-auto justify-center px-0 py-1.5" : "h-auto justify-start gap-2.5 px-2 py-1.5",
        )}
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" fill unoptimized sizes="32px" className="object-cover" />
          ) : isGroup ? (
            <Building2Icon className="size-4" />
          ) : (
            <UserIcon className="size-4" />
          )}
        </span>
        {collapsed ? null : (
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{t("viewProfile")}</span>
          </span>
        )}
      </Link>
    </SidebarTooltip>
  );
}

function ExploreNav() {
  const pathname = useCanonicalPathname();
  const t = useTranslations("common.sidebar.items");
  const sectionsT = useTranslations("common.sidebar.sections");
  const collapsed = useSidebarCollapsed();
  let leafIndex = 0;

  return (
    <div className="flex flex-col gap-3">
      {NAV_ITEMS.map((section, sectionIndex) => (
        <div key={section.id} className="flex flex-col gap-0.5">
          {collapsed ? (
            sectionIndex > 0 ? <div aria-hidden className="mx-auto my-1 h-px w-6 rounded-full bg-border" /> : null
          ) : (
            <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {sectionsT(section.id)}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              leafIndex += 1;
              return (
                <NavLeaf
                  key={item.id}
                  item={{ ...item, text: t(item.id) }}
                  isActive={isLeafActive(item.pathCheck, pathname)}
                  index={leafIndex}
                  // Certs are minted from a Project, so visually hang Certs
                  // under Projects (which sits directly above it).
                  paired={item.id === "bumicerts"}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SidebarHeader() {
  const collapsed = useSidebarCollapsed();
  return (
    <div className={cn("mb-4 flex w-full flex-col gap-2", collapsed && "items-center")}>
      <Link className={cn("flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50", collapsed ? "justify-center" : "gap-2.5")} href="/feed" aria-label="GainForest home">
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

        {collapsed ? null : (
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
        )}
      </Link>
    </div>
  );
}

function NavLeaf({ item, isActive, index, paired = false }: { item: NavLeaf; isActive: boolean; index: number; paired?: boolean }) {
  const collapsed = useSidebarCollapsed();
  const showConnector = paired && !collapsed;
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: 0.05 * index,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={cn("relative", showConnector && "ml-3.5")}
    >
      {showConnector ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-3.5 -top-1 bottom-1/2 w-3 rounded-bl-[10px] border-b border-l border-border"
        />
      ) : null}
      <SidebarTooltip label={item.text}>
        <Link
          href={item.href}
          aria-label={collapsed ? item.text : undefined}
          aria-current={isActive ? "page" : undefined}
          className="group block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <motion.div
            whileHover={collapsed ? undefined : { x: 2 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              buttonVariants({ variant: isActive ? "default" : "ghost" }),
              // Lighter, denser rows: only the active row keeps the filled pill;
              // inactive rows are a plain icon + label with no chip background.
              "relative h-8 w-full",
              collapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5",
              !isActive && "text-muted-foreground group-hover:text-primary hover:text-primary",
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center">
              <item.Icon className="h-4 w-4 shrink-0" />
            </span>
            {collapsed ? null : <span className="flex-1 text-left">{item.text}</span>}
          </motion.div>
        </Link>
      </SidebarTooltip>
    </motion.li>
  );
}

// Signed-out fallback only: the bare /manage shim resolves to the signed-in
// account (or shows sign-in). Signed-in links target the profile directly via
// the did-based builders below.
const PERSONAL_PROJECT_NEW_HREF = manageHref({ basePath: "/manage" }, "projects", { mode: "new" });

type ContextLinkProps = {
  sessionDid: string | null;
  className?: string;
  children: React.ReactNode;
};

// The create-project wizard is heavy (framer-motion, the site editor, etc.), so
// it's code-split and only fetched when the popup is actually opened.
const CreateProjectModalLazy = dynamic(
  () =>
    import("@/app/(manage)/manage/projects/_components/ManageProjectsClient").then((mod) => ({
      default: mod.CreateProjectModal,
    })),
  {
    ssr: false,
    loading: () => (
      <ModalContent dismissible={false} className="w-full">
        <div className="flex h-48 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </ModalContent>
    ),
  },
);

// The quick "Add observations" modal (iNaturalist-style drop zone + editable
// cards). Code-split so its image/EXIF/leaflet deps load only when opened.
const AddObservationsModalLazy = dynamic(
  () =>
    import("@/app/(manage)/manage/observations/_components/AddObservationsModal").then((mod) => ({
      default: mod.AddObservationsModal,
    })),
  {
    ssr: false,
    loading: () => (
      <ModalContent dismissible={false} className="w-full">
        <div className="flex h-48 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      </ModalContent>
    ),
  },
);

// The sidebar "Create a project" button opens the wizard as a popup over the
// current page instead of routing to /projects first. Signed-out users still
// follow the link (which routes them through sign-in).
function CreateProjectButton({ sessionDid, className, children }: ContextLinkProps) {
  if (!sessionDid) {
    return (
      <Link href={PERSONAL_PROJECT_NEW_HREF} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <AuthenticatedCreateProjectButton sessionDid={sessionDid} className={className}>
      {children}
    </AuthenticatedCreateProjectButton>
  );
}

function AuthenticatedCreateProjectButton({
  sessionDid,
  className,
  children,
}: {
  sessionDid: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const modal = useModal();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  const open = () => {
    let target: ManageTarget;
    if (activeContext.type === "group") {
      const activeGroup = groups.find((group) => group.groupDid === activeContext.did) ?? null;
      const identifier = activeGroup
        ? switcherGroupIdentifier(activeGroup)
        : activeContext.identifier?.trim() || activeContext.did;
      if (activeGroup) {
        setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
      }
      target = groupManageTarget({
        did: activeContext.did,
        accountKind: "organization",
        identifier,
        role: activeGroup?.role ?? null,
        currentUserDid: sessionDid,
      });
    } else {
      target = personalManageTarget({ did: sessionDid, accountKind: "user", identifier: sessionDid });
    }

    const projectsHref = manageHref({ basePath: groupManageBasePath(target.identifier) }, "projects");
    const closeModal = () => {
      void modal.hide().then(() => modal.clear());
    };
    modal.pushModal(
      {
        id: "create-project",
        dialogWidth: "max-w-3xl w-[calc(100%-2rem)]",
        forceDialog: true,
        content: (
          <CreateProjectModalLazy
            target={target}
            onClose={closeModal}
            onSaved={() => {
              closeModal();
              notifyProjectsChanged();
              router.push(projectsHref);
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  );
}

// Opens the quick "Add observations" modal over the current page, honoring the
// active account context (the org's repo for a group context, the signed-in
// user otherwise) so new observations land in the right place.
function AddObservationsButton({
  sessionDid,
  className,
  children,
}: {
  sessionDid: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const modal = useModal();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  const open = () => {
    let target: ManageTarget;
    if (activeContext.type === "group") {
      const activeGroup = groups.find((group) => group.groupDid === activeContext.did) ?? null;
      const identifier = activeGroup
        ? switcherGroupIdentifier(activeGroup)
        : activeContext.identifier?.trim() || activeContext.did;
      if (activeGroup) {
        setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
      }
      target = groupManageTarget({
        did: activeContext.did,
        accountKind: "organization",
        identifier,
        role: activeGroup?.role ?? null,
        currentUserDid: sessionDid,
      });
    } else {
      target = personalManageTarget({ did: sessionDid, accountKind: "user", identifier: sessionDid });
    }

    const observationsHref = manageHref({ basePath: groupManageBasePath(target.identifier) }, "observations");
    const closeModal = () => {
      void modal.hide().then(() => modal.clear());
    };
    modal.pushModal(
      {
        id: "add-observations",
        dialogWidth: "max-w-2xl w-[calc(100%-2rem)]",
        forceDialog: true,
        content: (
          <AddObservationsModalLazy
            target={target}
            onClose={closeModal}
            onViewObservations={() => {
              closeModal();
              router.push(observationsHref);
            }}
          />
        ),
      },
      true,
    );
    void modal.show();
  };

  return (
    <button type="button" onClick={open} className={className}>
      {children}
    </button>
  );
}

function ManageContextLink({
  sessionDid,
  personalHref,
  personalHrefForDid,
  hrefForGroup,
  className,
  children,
}: ContextLinkProps & {
  personalHref: string;
  personalHrefForDid: (did: string) => string;
  hrefForGroup: (identifier: string) => string;
}) {
  if (!sessionDid) {
    return (
      <Link href={personalHref} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <AuthenticatedManageContextLink
      sessionDid={sessionDid}
      personalHref={personalHrefForDid(sessionDid)}
      hrefForGroup={hrefForGroup}
      className={className}
    >
      {children}
    </AuthenticatedManageContextLink>
  );
}

function AuthenticatedManageContextLink({
  sessionDid,
  personalHref,
  hrefForGroup,
  className,
  children,
}: {
  sessionDid: string;
  personalHref: string;
  hrefForGroup: (identifier: string) => string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { groups } = useAccountList(sessionDid);
  const [activeContext, setActiveContext] = useActiveAccountContext(sessionDid);

  const activeGroup = activeContext.type === "group" ? groups.find((group) => group.groupDid === activeContext.did) ?? null : null;
  // Honor the active account context: an organization context targets that
  // organization's repo, a personal context targets the signed-in user's own
  // account — no organization required.
  const href = activeContext.type === "group"
    ? hrefForGroup(activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did)
    : personalHref;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // Personal context: let the Link navigate to the personal route without any
    // organization detour.
    if (activeContext.type !== "group") return;

    event.preventDefault();
    const identifier = activeGroup ? switcherGroupIdentifier(activeGroup) : activeContext.identifier?.trim() || activeContext.did;
    if (activeGroup) {
      setActiveContext({ type: "group", did: activeGroup.groupDid, identifier, role: activeGroup.role });
    }
    router.push(hrefForGroup(identifier));
  };

  return (
    <Link href={href} onClick={handleClick} className={className}>
      {children}
    </Link>
  );
}

// Once the active account (the signed-in user or the selected organization)
// already has at least one project, the sidebar "Create a project" card is
// redundant — the Projects nav item and the in-page "Add" button cover further
// creation — so we hide it. Until the check resolves we keep showing the card
// so a first-time account never loses its obvious path to a first project.
function useActiveContextHasProjects(sessionDid: string): boolean {
  const [activeContext] = useActiveAccountContext(sessionDid);
  const [hasProjects, setHasProjects] = useState(false);

  const contextKind = activeContext.type === "group" ? "group" : "personal";
  const contextDid = activeContext.did;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const href = manageApiHref("/api/manage/projects", { kind: contextKind, did: contextDid });
      void fetch(href, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled) setHasProjects(Array.isArray(data) && data.length > 0);
        })
        .catch(() => {
          if (!cancelled) setHasProjects(false);
        });
    };

    // Re-show while we recheck a freshly selected account context.
    setHasProjects(false);
    load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PROJECTS_CHANGED_EVENT, load);
    };
  }, [contextKind, contextDid]);

  return hasProjects;
}

function BumicertCreationCard({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.creationCard");
  const collapsed = useSidebarCollapsed();
  const hasProjects = useActiveContextHasProjects(sessionDid);

  // Hide the create-project CTA once this account already has a project.
  if (hasProjects) return null;

  if (collapsed) {
    return (
      <SidebarTooltip label={t("createProject")}>
        <span className="mx-auto flex w-fit">
          <CreateProjectButton
            sessionDid={sessionDid}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "bg-background hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <PlusIcon />
            <span className="sr-only">{t("createProject")}</span>
          </CreateProjectButton>
        </span>
      </SidebarTooltip>
    );
  }

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
      <CreateProjectButton
        sessionDid={sessionDid}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "relative z-2 w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <PlusIcon /> {t("createProject")}
      </CreateProjectButton>
    </div>
  );
}

function AddObservationsCard({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.creationCard");
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    return (
      <SidebarTooltip label={t("addObservations")}>
        <span className="mx-auto flex w-fit">
          <AddObservationsButton
            sessionDid={sessionDid}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "bg-background hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <BinocularsIcon />
            <span className="sr-only">{t("addObservations")}</span>
          </AddObservationsButton>
        </span>
      </SidebarTooltip>
    );
  }

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
        {/*Hover Transitioning Observation Card*/}
        <div className="absolute z-1 -bottom-4 left-1/2 -translate-x-1/2 scale-100 group-hover:scale-120 -rotate-12 group-hover:-rotate-30 transition-transform bg-background/50 backdrop-blur-lg border border-border shadow-xl rounded-xl h-20 w-16 p-1 flex flex-col gap-1">
          <div className="w-full h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <BinocularsIcon className="text-primary size-6 opacity-80" />
          </div>
          <div className="bg-muted h-2 rounded-lg w-8"></div>
          <div className="bg-muted h-2 rounded-lg w-full"></div>
        </div>
      </div>

      {/*CTA*/}
      <AddObservationsButton
        sessionDid={sessionDid}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "relative z-2 w-full bg-background hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <BinocularsIcon /> {t("addObservations")}
      </AddObservationsButton>
    </div>
  );
}

function SocialFooter() {
  const collapsed = useSidebarCollapsed();
  return (
    <div className={cn("flex px-1", collapsed ? "flex-col items-center gap-1" : "items-center justify-between")}>
      {collapsed ? null : <span className="text-xs font-medium text-muted-foreground">GainForest v{APP_VERSION}</span>}
      {/* Language + theme controls live together in the sidebar footer; the
          language picker sits directly to the left of the dark/light toggle. */}
      <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
        <LanguageSelector compact={collapsed} />
        <ThemeToggle />
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

function Header({
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
            <GlobalSearch />
            <AuthButton
              session={authSession}
              profileName={profileName}
              isProfileNameLoading={profileName === undefined}
              manageAccountKind={manageAccountKind}
            />
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

