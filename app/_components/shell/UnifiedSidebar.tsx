"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import {
  BinocularsIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  LeafIcon,
  LayoutGridIcon,
  SparkleIcon,
  UserIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import packageJson from "@/package.json";
import { Button, buttonVariants } from "@/components/ui/button";
import { BrandWord } from "@/components/ui/typography";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import type { AuthSession } from "../../_lib/auth";
import { GAINFOREST_MODERATION_REPO_DID } from "../../_lib/indexer";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "../../_lib/account-switcher";
import { AdminOnlyIndicator } from "../AdminOnlyIndicator";
import { SignInPrompt } from "../AuthFlow";
import { NAV_ITEMS, isLeafActive, type NavLeaf } from "./nav-config";
import { useCanonicalPathname } from "./paths";
import { SidebarCollapsedProvider, SidebarTooltip, useSidebarCollapsed } from "./sidebar-context";
import { AddObservationsButton, CreateProjectButton, useActiveContextHasProjects } from "./context-actions";
import { ThemeToggle } from "./ThemeToggle";

const APP_VERSION = packageJson.version;

export function UnifiedSidebar({
  authSession,
  collapsed = false,
}: {
  authSession: AuthSession | null;
  collapsed?: boolean;
}) {
  return (
    <SidebarCollapsedProvider value={collapsed}>
    <nav
      className={cn(
        "relative isolate z-30 flex h-full flex-col border-r border-border bg-muted transition-[width,padding] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none",
        collapsed ? "w-[76px] overflow-visible p-3" : "w-[256px] overflow-hidden p-4",
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-108 overflow-hidden"
      >
        <div className="absolute -bottom-24 left-1/2 h-56 w-[160%] -translate-x-1/2 rounded-[50%] bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/[0.12] blur-2xl" />
        <ExploreArt />
      </div>

      <SidebarHeader />

      <div className="mt-3 border-t border-border" />

      <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3", collapsed ? "overflow-x-hidden" : "pr-1")}>
        {authSession?.isLoggedIn ? <SidebarProfileRow did={authSession.did} /> : null}
        <LayoutGroup id="unified-sidebar-nav">
          <ExploreNav sessionDid={authSession?.isLoggedIn ? authSession.did : null} />
        </LayoutGroup>

        <div className="mt-auto flex flex-col gap-3 pt-4">
          {authSession?.isLoggedIn ? (
            <CreationHubCard sessionDid={authSession.did} />
          ) : (
            <SignInPrompt collapsed={collapsed} />
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <SocialFooter />
      </div>
    </nav>
    </SidebarCollapsedProvider>
  );
}

/** Circular chevron that straddles the sidebar's right edge to collapse/expand. */
export function SidebarCollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
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
            <span className="grid place-items-center">
              <ChevronLeftIcon className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", collapsed && "rotate-180")} />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
        <span
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
            // Sky = organization, green = personal; matches the "Publishing as"
            // chip so the two surfaces read as the same concept.
            isGroup ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-primary/10 text-primary",
          )}
        >
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
            {/* Say what kind of account is active (mirrors the top-right
                switcher) so it's always clear whether new uploads go to the
                person or to an organization. */}
            <span className={cn("truncate text-xs", isGroup ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}>
              {isGroup ? t("organizationAccount") : t("personalAccount")}
            </span>
          </span>
        )}
      </Link>
    </SidebarTooltip>
  );
}

function ExploreNav({ sessionDid }: { sessionDid: string | null }) {
  const pathname = useCanonicalPathname();
  const t = useTranslations("common.sidebar.items");
  const sidebarT = useTranslations("common.sidebar");
  const sectionsT = useTranslations("common.sidebar.sections");
  const collapsed = useSidebarCollapsed();
  const [moreOpen, setMoreOpen] = useState(false);

  // GainForest moderators (members of the admin group, any role) see the
  // admin-only entries. Same detection as the account menu's /admin link;
  // the routes themselves re-check access server-side.
  const { groups } = useAccountList(sessionDid);
  const isModerator = groups.some((group) => group.groupDid === GAINFOREST_MODERATION_REPO_DID);
  const sections = NAV_ITEMS.map((section) => ({
    ...section,
    // Organizations are already reached through profiles and the account
    // switcher; repeating the directory here adds noise without helping the
    // everyday Feed → Projects → Observations flow.
    items: section.items.filter((item) => item.id !== "organizations" && (!item.adminOnly || isModerator)),
  })).filter((section) => section.items.length > 0);

  // Keep the everyday path short for new visitors. Specialist destinations
  // remain one click away and open automatically whenever one is active.
  const primaryIds = new Set(["feed", "projects", "observations", "globe", "bioblitz", "donations", "grants"]);
  const primarySections = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => primaryIds.has(item.id)) }))
    .filter((section) => section.items.length > 0);
  const secondarySections = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !primaryIds.has(item.id)) }))
    .filter((section) => section.items.length > 0);
  const secondaryActive = secondarySections.some((section) =>
    section.items.some((item) => isLeafActive(item.pathCheck, pathname)),
  );

  // A secondary route reveals its navigation, but the user can still dismiss
  // it. Minimizing always closes the disclosure before the sidebar returns.
  useEffect(() => {
    if (collapsed) setMoreOpen(false);
    else if (secondaryActive) setMoreOpen(true);
  }, [collapsed, secondaryActive]);

  const showMore = moreOpen;
  let leafIndex = 0;

  const renderSections = (items: typeof sections, showSectionLabels: boolean, allowGrid = false) =>
    items.map((section) => {
      // The Explore group is the everyday entry point (Feed · Projects ·
      // Observations · Globe); a 2×2 grid of icon tiles reads as a launcher
      // rather than a plain list. Collapsed rail and the "More" overflow keep
      // the compact row layout.
      const asGrid = allowGrid && section.id === "explore" && !collapsed;
      return (
        <div key={section.id} className="flex flex-col gap-0.5">
          {showSectionLabels && !collapsed ? (
            <div className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {sectionsT(section.id)}
            </div>
          ) : null}
          {asGrid ? (
            <ul className="grid grid-cols-2 gap-2 px-0.5 pb-0.5 pt-0.5">
              {section.items.map((item) => {
                leafIndex += 1;
                return (
                  <NavLeafTile
                    key={item.id}
                    item={{ ...item, text: t(item.id) }}
                    isActive={isLeafActive(item.pathCheck, pathname)}
                    index={leafIndex}
                  />
                );
              })}
            </ul>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                leafIndex += 1;
                return (
                  <NavLeafRow
                    key={item.id}
                    item={{ ...item, text: t(item.id) }}
                    isActive={isLeafActive(item.pathCheck, pathname)}
                    index={leafIndex}
                  />
                );
              })}
            </ul>
          )}
        </div>
      );
    });

  return (
    <div className="flex flex-col gap-1">
      {renderSections(primarySections, true, true)}
      {secondarySections.length > 0 ? (
        <div className="mt-1 border-t border-border/70 pt-1">
          {!showMore ? (
            <SidebarTooltip label={sidebarT("more")}>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={false}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "h-8 w-full text-muted-foreground hover:text-foreground",
                  collapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5",
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <LayoutGridIcon className="size-4" />
                </span>
                {collapsed ? null : (
                  <>
                    <span className="flex-1 text-left">{sidebarT("more")}</span>
                    <ChevronDownIcon className="size-3.5" />
                  </>
                )}
              </button>
            </SidebarTooltip>
          ) : (
            <>
              <div className="flex flex-col gap-2">{renderSections(secondarySections, true)}</div>
              <SidebarTooltip label={sidebarT("hideMore")}>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-expanded={true}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "mt-1 h-8 w-full text-muted-foreground hover:text-foreground",
                    collapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    <ChevronDownIcon className="size-4 rotate-180" />
                  </span>
                  {collapsed ? null : <span className="flex-1 text-left">{sidebarT("hideMore")}</span>}
                </button>
              </SidebarTooltip>
            </>
          )}
        </div>
      ) : null}
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
            className="text-xl font-bold tracking-tight text-foreground"
          >
            <BrandWord />
          </motion.span>
        )}
      </Link>
    </div>
  );
}

function NavLeafRow({ item, isActive, index, paired = false }: { item: NavLeaf; isActive: boolean; index: number; paired?: boolean }) {
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
            {item.adminOnly ? (
              <AdminOnlyIndicator className={collapsed ? "absolute right-1 top-1" : undefined} />
            ) : null}
          </motion.div>
        </Link>
      </SidebarTooltip>
    </motion.li>
  );
}

/** Grid tile used for the Explore launcher (expanded sidebar only): a stacked
 *  icon-over-label affordance laid out as a 2×2 launcher instead of a column.
 *  Tiles are raised `bg-background` insets against the muted sidebar (a quiet
 *  contrast surface, not a per-sibling border — design.md §7); only the active
 *  tile takes the filled primary treatment, matching the list rows. */
function NavLeafTile({ item, isActive, index }: { item: NavLeaf; isActive: boolean; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.04 * index, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <motion.div
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          className={cn(
            "relative flex h-full flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors motion-reduce:transition-none",
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-primary",
          )}
        >
          <item.Icon className="size-5 shrink-0" />
          <span className="text-xs font-medium leading-tight">{item.text}</span>
          {item.adminOnly ? <AdminOnlyIndicator className="absolute right-1.5 top-1.5" /> : null}
        </motion.div>
      </Link>
    </motion.li>
  );
}

/** Always-on spinning sparkles scattered across the pop-out band above the
 *  card. Uses the card's `group/card` hover and honors reduced motion. */
function CreationSparkles() {
  const sparkle =
    "absolute animate-spin-slow text-primary transition-all duration-300 motion-reduce:animate-none motion-reduce:transition-none";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-7 h-16">
      <SparkleIcon className={cn(sparkle, "left-2 top-7 size-6 rotate-30 opacity-50 group-hover/card:scale-125 group-hover/card:opacity-40")} fill="currentcolor" strokeWidth={0} />
      <SparkleIcon className={cn(sparkle, "left-11 top-2 size-3 rotate-45 opacity-40 group-hover/card:scale-125 group-hover/card:opacity-60")} fill="currentcolor" strokeWidth={0} />
      <SparkleIcon className={cn(sparkle, "right-2 top-7 size-6 rotate-45 opacity-50 group-hover/card:scale-125 group-hover/card:opacity-40")} fill="currentcolor" strokeWidth={0} />
      <SparkleIcon className={cn(sparkle, "right-11 top-2 size-3 rotate-30 opacity-40 group-hover/card:scale-125 group-hover/card:opacity-60")} fill="currentcolor" strokeWidth={0} />
    </div>
  );
}

// The bold 3D "record" tile — the hero of the creation card. It reads as a
// nature record being minted (tinted icon plate over two skeleton lines) and is
// positioned to break out over the card's top edge, tilted with a soft shadow.
// The parent card animates its transform on hover; the tile only declares the
// look. Position/rotation come from `className`.
function CreationTile({
  Icon,
  className,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute left-1/2 flex h-[72px] w-[60px] flex-col gap-1.5 rounded-2xl border border-border bg-background p-2 shadow-xl transition-transform duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
    >
      <div className="flex flex-1 items-center justify-center rounded-xl bg-primary/15">
        <Icon className="size-6 text-primary" />
      </div>
      <div className="h-1 w-2/3 rounded-full bg-muted" />
      <div className="h-1 w-full rounded-full bg-muted" />
    </div>
  );
}

// One expressive creation region instead of two near-identical cards. It always
// carries "Add observations" (the everyday path); "Create a project" joins it
// only while the active account still has no project. Whatever the state, the
// card keeps the same playful language — spinning sparkles and a bold 3D record
// tile that breaks out over the top edge, plus CTAs that fill on hover — so the
// three variants feel like one family while the tile art + icons say at a glance
// what each opens. See [[project_site_modal_architecture]] for what each opens.
function CreationHubCard({ sessionDid }: { sessionDid: string }) {
  const t = useTranslations("common.sidebar.creationCard");
  const collapsed = useSidebarCollapsed();
  const hasProjects = useActiveContextHasProjects(sessionDid);
  // The create-project affordance retires once the account owns a project; the
  // Projects nav item and in-page "Add" cover further creation.
  const showProject = !hasProjects;
  const variant: "observation" | "both" = showProject ? "both" : "observation";

  // Shared CTA recipe: a recessed slot that fills primary on hover — the
  // original card's playful "press to plant" feel, kept for every variant.
  const ctaSlot =
    "flex items-center justify-center gap-2 rounded-xl bg-muted font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none";

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <SidebarTooltip label={t("addObservations")}>
          <span className="flex w-fit">
            <AddObservationsButton
              sessionDid={sessionDid}
              dataTaina="add-observations"
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "bg-background hover:bg-primary hover:text-primary-foreground")}
            >
              <BinocularsIcon />
              <span className="sr-only">{t("addObservations")}</span>
            </AddObservationsButton>
          </span>
        </SidebarTooltip>
        {showProject ? (
          <SidebarTooltip label={t("createProject")}>
            <span className="flex w-fit">
              <CreateProjectButton
                sessionDid={sessionDid}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }), "bg-background hover:bg-primary hover:text-primary-foreground")}
              >
                <LeafIcon />
                <span className="sr-only">{t("createProject")}</span>
              </CreateProjectButton>
            </span>
          </SidebarTooltip>
        ) : null}
      </div>
    );
  }

  return (
    // `mt-9` reserves the pop-out band above the card so the tile can breach the
    // top edge without colliding with the nav; `overflow-visible` lets it, and
    // `pt-9` keeps the CTAs clear of the tile's lower half.
    <div className="group/card relative isolate mt-9 flex w-full flex-col gap-1.5 overflow-visible rounded-2xl border border-border bg-background px-2 pb-2 pt-9">
      {/* Soft primary glow behind the popped tile (hidden where the opaque card
          body overlaps it; visible in the pop-out band above the top edge). */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-2xl" />
      <CreationSparkles />
      {/* The 3D record tile(s) straddle the top edge (-top-9) and lift on hover. */}
      {variant === "both" ? (
        <>
          <CreationTile
            Icon={LeafIcon}
            className="-top-9 -translate-x-[82%] -rotate-[14deg] group-hover/card:-translate-x-[112%] group-hover/card:-translate-y-1 group-hover/card:-rotate-[24deg]"
          />
          <CreationTile
            Icon={BinocularsIcon}
            className="-top-10 z-1 -translate-x-[18%] rotate-[10deg] group-hover/card:-translate-x-[2%] group-hover/card:-translate-y-1.5 group-hover/card:rotate-[22deg]"
          />
        </>
      ) : (
        <CreationTile
          Icon={variant === "project" ? LeafIcon : BinocularsIcon}
          className="-top-9 -translate-x-1/2 -rotate-6 group-hover/card:-translate-y-1.5 group-hover/card:-rotate-12"
        />
      )}

      {variant === "both" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <AddObservationsButton
            sessionDid={sessionDid}
            dataTaina="add-observations"
            className={cn(ctaSlot, "h-auto flex-col gap-1 px-2 py-2 text-xs")}
          >
            <BinocularsIcon className="size-4" />
            <span className="leading-tight">{t("observation")}</span>
          </AddObservationsButton>
          <CreateProjectButton
            sessionDid={sessionDid}
            className={cn(ctaSlot, "h-auto flex-col gap-1 px-2 py-2 text-xs")}
          >
            <LeafIcon className="size-4" />
            <span className="leading-tight">{t("project")}</span>
          </CreateProjectButton>
        </div>
      ) : (
        <AddObservationsButton
          sessionDid={sessionDid}
          dataTaina="add-observations"
          className={cn(ctaSlot, "h-9 w-full px-3 text-sm")}
        >
          <BinocularsIcon className="size-4" /> {t("addObservations")}
        </AddObservationsButton>
      )}
    </div>
  );
}

function SocialFooter() {
  const collapsed = useSidebarCollapsed();
  const footerT = useTranslations("common.sidebar");
  return (
    <div className={cn("flex px-1", collapsed ? "flex-col items-center gap-1" : "items-center justify-between")}>
      {collapsed ? null : (
        <Link
          href="/changelog"
          className="rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          title={footerT("changelogLink")}
        >
          GainForest v{APP_VERSION}
        </Link>
      )}
      {/* Language + theme controls live together in the sidebar footer; the
          language picker sits directly to the left of the dark/light toggle. */}
      <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
        <LanguageSelector compact={collapsed} />
        <ThemeToggle />
      </div>
    </div>
  );
}

function ExploreArt() {
  return (
    <>
      <Vine side="left" className="bottom-0 left-0 h-26 w-5" />
      <Vine side="right" className="bottom-0 right-0 h-26 w-5" />
    </>
  );
}

function Vine({ side, className }: { side: "left" | "right"; className?: string }) {
  return (
    <svg
      viewBox="0 0 60 240"
      fill="none"
      preserveAspectRatio="xMidYMax meet"
      className={cn("absolute text-primary", side === "right" && "-scale-x-100", className)}
    >
      <path
        d="M16 240 C 9 206 24 188 16 158 C 9 130 26 110 16 80 C 10 56 22 36 16 8"
        className="stroke-primary/30"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <g className="fill-primary/20">
        <path d="M16 198 C 32 194 39 178 36 168 C 25 171 16 183 16 198 Z" />
        <path d="M16 150 C 2 147 -4 133 -1 124 C 11 127 16 138 16 150 Z" />
        <path d="M16 104 C 32 100 39 84 36 74 C 25 77 16 89 16 104 Z" />
        <path d="M16 58 C 2 55 -4 41 -1 32 C 11 35 16 46 16 58 Z" />
      </g>
    </svg>
  );
}
