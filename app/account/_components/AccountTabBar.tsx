"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeCheckIcon, BinocularsIcon, BotIcon, FolderKanbanIcon, HeartHandshakeIcon, HomeIcon, ImageIcon, MessageSquareTextIcon, SettingsIcon, UsersIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import type { AccountKind } from "../_lib/account-route";
import {
  accountAttachmentsPath,
  accountEndorsementsGivenPath,
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
} from "../_lib/account-route";

type TabLabelKey = "home" | "overview" | "bumicerts" | "projects" | "donationHistory" | "observations" | "posts" | "timeline" | "gallery" | "filesAndPhotos" | "settings" | "sites" | "audio" | "drone" | "trees" | "members" | "taina" | "endorsementsGiven";

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
  const appendExtras = (tabs: Tab[]): Tab[] => {
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
  if (scope === "account" && showEndorsementsGiven) {
    tabs.push(endorsementsGivenTab);
  }
  if (scope === "account" && showOrgData) {
    tabs.push(
      { labelKey: "members", href: accountMembersPath(did), icon: UsersIcon, exact: false },
    );
  }
  if (scope === "account") {
    tabs.push(
      {
        labelKey: "filesAndPhotos",
        href: paths.gallery,
        icon: ImageIcon,
        exact: false,
        matchPaths: [accountAttachmentsPath(did)],
      },
    );
  }
  return appendExtras(tabs);
}

interface OrgTabBarProps {
  did: string;
  accountKind?: AccountKind;
  scope?: AccountTabBarScope;
  includeSettings?: boolean;
  showOrgData?: boolean;
  includeTaina?: boolean;
  showEndorsementsGiven?: boolean;
  manageBasePath?: string;
}

export function AccountTabBar({
  did,
  accountKind = "organization",
  scope = "account",
  includeSettings = false,
  showOrgData = false,
  includeTaina = false,
  showEndorsementsGiven = false,
  manageBasePath,
}: OrgTabBarProps) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const searchParams = useSearchParams();
  const tabs = buildTabs(did, accountKind, scope, includeSettings, showOrgData, includeTaina, showEndorsementsGiven, manageBasePath);

  function isActive(tab: Tab): boolean {
    if (scope === "manage") {
      const currentTab = searchParams.get("tab");
      const tabName = new URL(tab.href, "https://certs.local").searchParams.get("tab");
      return currentTab ? currentTab === tabName : tab.href === tabs[0]?.href;
    }

    if (tab.matchPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
    return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
  }

  return (
    <div className="mt-3">
      {/* Horizontally scrollable on mobile, hidden scrollbar */}
      <div className="overflow-x-auto scrollbar-hidden -mx-4 px-4">
        <div className="flex items-end gap-1 min-w-max border-b border-border">
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap select-none",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t(tab.labelKey)}

                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
