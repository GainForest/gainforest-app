"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeCheckIcon, BinocularsIcon, BotIcon, ChevronDownIcon, FolderKanbanIcon, HeartHandshakeIcon, HomeIcon, ImageIcon, MessageSquareTextIcon, SettingsIcon, UsersIcon, WalletIcon, WrenchIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { formatNumber } from "@/app/_lib/format";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { AccountKind } from "../_lib/account-route";
import {
  accountAttachmentsPath,
  accountEndorsementsGivenPath,
  accountEquipmentPath,
  accountAudioPath,
  accountBumicertsPath,
  accountDonationsPath,
  accountDronePath,
  accountGalleryPath,
  accountLikesPath,
  accountMembersPath,
  accountObservationsPath,
  accountPath,
  accountPostsPath,
  accountProjectsPath,
  accountRepliesPath,
  accountSettingsPath,
  accountTainaPath,
  accountTreesPath,
  accountWalletPath,
} from "../_lib/account-route";

type TabLabelKey = "home" | "overview" | "bumicerts" | "projects" | "donationHistory" | "observations" | "posts" | "timeline" | "gallery" | "filesAndPhotos" | "settings" | "sites" | "audio" | "drone" | "trees" | "members" | "taina" | "endorsementsGiven" | "equipment" | "wallet";

interface Tab {
  labelKey: TabLabelKey;
  href: string;
  icon: React.ElementType;
  exact: boolean;
  /**
   * Extra route prefixes that should also mark this tab active — used so the
   * Observations tab stays highlighted while you're on its Trees/Audio/Drone
   * sub-views, which have their own routes.
   */
  matchPaths?: string[];
}

type AccountTabBarKind = "organization" | "user";
type AccountTabBarScope = "account" | "manage";

type TabPaths = {
  home: string;
  bumicerts: string;
  projects: string;
  donations: string;
  activity: string;
  gallery: string;
  settings: string;
};

function buildTabPaths(did: string, scope: AccountTabBarScope, manageBasePath = "/manage"): TabPaths {
  if (scope === "manage") {
    return {
      home: `${manageBasePath}?tab=home`,
      bumicerts: `${manageBasePath}?tab=bumicerts`,
      projects: `${manageBasePath}/projects`,
      donations: `${manageBasePath}?tab=donations`,
      activity: `${manageBasePath}?tab=observations`,
      gallery: `${manageBasePath}?tab=gallery`,
      settings: `${manageBasePath}?tab=settings`,
    };
  }

  return {
    home: accountPath(did),
    bumicerts: accountBumicertsPath(did),
    projects: accountProjectsPath(did),
    donations: accountDonationsPath(did),
    activity: accountObservationsPath(did),
    gallery: accountGalleryPath(did),
    settings: accountSettingsPath(did),
  };
}

function buildTabs(
  did: string,
  accountKind: AccountTabBarKind,
  scope: AccountTabBarScope,
  includeSettings: boolean,
  showOrgData: boolean,
  includeTaina: boolean,
  showEndorsementsGiven: boolean,
  showEquipment: boolean,
  includeWallet: boolean,
  manageBasePath?: string,
): Tab[] {
  const paths = buildTabPaths(did, scope, manageBasePath);
  const settingsTab: Tab = {
    labelKey: "settings",
    href: paths.settings,
    icon: SettingsIcon,
    exact: false,
  };
  // Tainá (the Telegram field assistant) is personal: the tab only shows on
  // the owner's own profile, next to Settings.
  const tainaTab: Tab = {
    labelKey: "taina",
    href: accountTainaPath(did),
    icon: BotIcon,
    exact: false,
  };
  // The donation wallet is private: personal owners and organization members
  // see it inside More; the route/API enforce finer role permissions.
  const walletTab: Tab = {
    labelKey: "wallet",
    href: accountWalletPath(did),
    icon: WalletIcon,
    exact: false,
  };
  // Posts / Replies / Likes share one profile tab (the page carries the
  // sub-toggle), so the tab stays active across all three routes. Public
  // activity, so it only appears on the profile (not the manage dashboard).
  const postsTab: Tab = {
    labelKey: "posts",
    href: accountPostsPath(did),
    icon: MessageSquareTextIcon,
    exact: false,
    matchPaths: [accountRepliesPath(did), accountLikesPath(did)],
  };
  // Organizations this org has publicly endorsed. Only shown when it has given
  // at least one endorsement (resolved server-side into `showEndorsementsGiven`).
  const endorsementsGivenTab: Tab = {
    labelKey: "endorsementsGiven",
    href: accountEndorsementsGivenPath(did),
    icon: BadgeCheckIcon,
    exact: false,
  };
  // Field equipment registry — a private inventory surface. On personal
  // profiles it only appears for the signed-in owner; on organizations it
  // aggregates the whole team's gear, so — like Members — it only shows to
  // people who belong to the organization.
  const equipmentTab: Tab = {
    labelKey: "equipment",
    href: accountEquipmentPath(did),
    icon: WrenchIcon,
    exact: false,
  };
  const appendExtras = (tabs: Tab[]): Tab[] => {
    if (includeWallet && scope === "account") tabs.push(walletTab);
    if (includeTaina && scope === "account") tabs.push(tainaTab);
    if (includeSettings) tabs.push(settingsTab);
    return tabs;
  };

  if (accountKind === "user") {
    const projectsTab: Tab = { labelKey: "projects", href: paths.projects, icon: FolderKanbanIcon, exact: false };
    const observationsTab: Tab = {
      labelKey: "observations",
      href: paths.activity,
      icon: BinocularsIcon,
      exact: false,
      // Trees / Audio / Drone are sub-views of Observations now.
      matchPaths: scope === "account" ? [accountTreesPath(did), accountAudioPath(did), accountDronePath(did)] : undefined,
    };
    const donationsTab: Tab = { labelKey: "donationHistory", href: paths.donations, icon: HeartHandshakeIcon, exact: false };

    // Public profile leads with a compact Overview, then Projects,
    // Observations, Gallery, and Donations. Certs are no longer a separate
    // profile section — each project carries its own impact certificate.
    // Sites and Timeline live on each project. The only things that stay
    // organization-only are Members + the Data Council. The manage dashboard
    // keeps its simpler order.
    const tabs: Tab[] = scope === "account"
      ? [
          { labelKey: "overview", href: paths.home, icon: HomeIcon, exact: true },
          projectsTab,
          observationsTab,
          postsTab,
          // Photos (galleries) and other file attachments share one tab; the
          // page carries a Photos | Files sub-toggle.
          {
            labelKey: "filesAndPhotos",
            href: paths.gallery,
            icon: ImageIcon,
            exact: false,
            matchPaths: [accountAttachmentsPath(did)],
          },
          donationsTab,
        ]
      : [projectsTab, observationsTab, donationsTab];
    if (scope === "account" && showEquipment) tabs.push(equipmentTab);
    return appendExtras(tabs);
  }

  const tabs: Tab[] = [
    {
      labelKey: "overview",
      href: paths.home,
      icon: HomeIcon,
      exact: true,
    },
    {
      labelKey: "projects",
      href: paths.projects,
      icon: FolderKanbanIcon,
      exact: false,
    },
    {
      labelKey: "observations",
      href: paths.activity,
      icon: BinocularsIcon,
      exact: false,
      // Trees / Audio / Drone are sub-views of Observations now.
      matchPaths: scope === "account" ? [accountTreesPath(did), accountAudioPath(did), accountDronePath(did)] : undefined,
    },
  ];
  // Members stay an organization-only governance surface, shown to managers on
  // the profile. Trees, Audio and Drone are reached through the Observations
  // sub-nav. Sites and Timeline now live on each project, not the profile.
  if (scope === "account") {
    tabs.push(postsTab);
  }
  if (scope === "account" && showOrgData) {
    tabs.push(
      { labelKey: "members", href: accountMembersPath(did), icon: UsersIcon, exact: false },
    );
  }
  if (scope === "account" && showEquipment) {
    tabs.push(equipmentTab);
  }
  if (scope === "account" && showEndorsementsGiven) {
    tabs.push(endorsementsGivenTab);
  }
  // Organizations show a few recent photos in the Overview sidebar; the full
  // library (and file attachments) stays one click away under More.
  if (scope === "account") {
    tabs.push({
      labelKey: "filesAndPhotos",
      href: paths.gallery,
      icon: ImageIcon,
      exact: false,
      matchPaths: [accountAttachmentsPath(did)],
    });
  }
  return appendExtras(tabs);
}

/** At-a-glance totals shown beside a tab label, e.g. "Projects 12". */
export type AccountTabCounts = Partial<Record<TabLabelKey, number | null>>;

interface OrgTabBarProps {
  did: string;
  accountKind?: AccountKind;
  scope?: AccountTabBarScope;
  includeSettings?: boolean;
  showOrgData?: boolean;
  includeTaina?: boolean;
  showEndorsementsGiven?: boolean;
  showEquipment?: boolean;
  includeWallet?: boolean;
  manageBasePath?: string;
  counts?: AccountTabCounts;
}

export function AccountTabBar({
  did,
  accountKind = "organization",
  scope = "account",
  includeSettings = false,
  showOrgData = false,
  includeTaina = false,
  showEndorsementsGiven = false,
  showEquipment = false,
  includeWallet = false,
  manageBasePath,
  counts,
}: OrgTabBarProps) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const searchParams = useSearchParams();
  const tabs = buildTabs(did, accountKind, scope, includeSettings, showOrgData, includeTaina, showEndorsementsGiven, showEquipment, includeWallet, manageBasePath);

  function isActive(tab: Tab): boolean {
    if (scope === "manage") {
      const currentTab = searchParams.get("tab");
      const tabName = new URL(tab.href, "https://certs.local").searchParams.get("tab");
      return currentTab ? currentTab === tabName : tab.href === tabs[0]?.href;
    }

    if (tab.matchPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
    return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
  }

  // Profiles can expose many specialist/private surfaces. Keep the three
  // universal destinations visible and put everything else in one proper
  // menu; direct URLs and active states continue to work unchanged.
  const primaryKeys = new Set<TabLabelKey>(["overview", "projects", "observations"]);
  const primaryTabs = tabs.filter((tab) => primaryKeys.has(tab.labelKey));
  const moreTabs = tabs.filter((tab) => !primaryKeys.has(tab.labelKey));
  const moreActive = moreTabs.some(isActive);

  return (
    <div className="mt-5">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hidden">
        <div className="flex min-w-max items-end gap-5 border-b border-border">
          {primaryTabs.map((tab) => {
            const active = isActive(tab);
            const count = counts?.[tab.labelKey];
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex items-baseline gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-[15px] transition-colors duration-150 select-none",
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(tab.labelKey)}
                {typeof count === "number" ? (
                  <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(count)}</span>
                ) : null}
                {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" /> : null}
              </Link>
            );
          })}

          {moreTabs.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "relative flex items-center gap-1 whitespace-nowrap pb-2.5 pt-1 text-[15px] transition-colors duration-150 select-none",
                    moreActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("more")}
                  <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
                  {moreActive ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" /> : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-52">
                {moreTabs.map((tab) => {
                  const active = isActive(tab);
                  const Icon = tab.icon;
                  return (
                    <DropdownMenuItem key={tab.href} asChild>
                      <Link href={tab.href} className={cn("flex items-center gap-2", active && "bg-accent font-medium text-accent-foreground")}>
                        <Icon className="size-4 text-muted-foreground" />
                        {t(tab.labelKey)}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}
