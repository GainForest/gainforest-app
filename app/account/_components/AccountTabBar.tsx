"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ActivityIcon, BadgeIcon, HeartIcon, HomeIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccountKind } from "../_lib/account-route";
import {
  accountBumicertsPath,
  accountDonationsPath,
  accountPath,
  accountSettingsPath,
  accountTimelinePath,
} from "../_lib/account-route";

interface Tab {
  label: "Home" | "Bumicerts" | "Donation History" | "Evidence Timeline" | "Settings";
  href: string;
  icon: React.ElementType;
  exact: boolean;
}

type AccountTabBarKind = "organization" | "user";
type AccountTabBarScope = "account" | "manage";

type TabPaths = {
  home: string;
  bumicerts: string;
  donations: string;
  timeline: string;
  settings: string;
};

function buildTabPaths(did: string, scope: AccountTabBarScope): TabPaths {
  if (scope === "manage") {
    return {
      home: "/manage?tab=home",
      bumicerts: "/manage?tab=bumicerts",
      donations: "/manage?tab=donations",
      timeline: "/manage?tab=timeline",
      settings: "/manage?tab=settings",
    };
  }

  return {
    home: accountPath(did),
    bumicerts: accountBumicertsPath(did),
    donations: accountDonationsPath(did),
    timeline: accountTimelinePath(did),
    settings: accountSettingsPath(did),
  };
}

function buildTabs(
  did: string,
  accountKind: AccountTabBarKind,
  scope: AccountTabBarScope,
  includeSettings: boolean,
): Tab[] {
  const paths = buildTabPaths(did, scope);
  const settingsTab: Tab = {
    label: "Settings",
    href: paths.settings,
    icon: SettingsIcon,
    exact: false,
  };

  if (accountKind === "user") {
    const tabs: Tab[] = [
      {
        label: "Bumicerts",
        href: paths.bumicerts,
        icon: BadgeIcon,
        exact: false,
      },
      {
        label: "Donation History",
        href: paths.donations,
        icon: HeartIcon,
        exact: false,
      },
    ];
    if (includeSettings) tabs.push(settingsTab);
    return tabs;
  }

  const tabs: Tab[] = [
    {
      label: "Home",
      href: paths.home,
      icon: HomeIcon,
      exact: true,
    },
    {
      label: "Bumicerts",
      href: paths.bumicerts,
      icon: BadgeIcon,
      exact: false,
    },
    {
      label: "Evidence Timeline",
      href: paths.timeline,
      icon: ActivityIcon,
      exact: false,
    },
  ];
  if (includeSettings) tabs.push(settingsTab);
  return tabs;
}

interface OrgTabBarProps {
  did: string;
  accountKind?: AccountKind;
  scope?: AccountTabBarScope;
  includeSettings?: boolean;
}

export function AccountTabBar({
  did,
  accountKind = "organization",
  scope = "account",
  includeSettings = false,
}: OrgTabBarProps) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const tabs = buildTabs(did, accountKind, scope, includeSettings);
  const paths = buildTabPaths(did, scope);

  function isActive(tab: Tab): boolean {
    if (scope === "manage") {
      const currentTab = searchParams.get("tab");
      const tabName = new URL(tab.href, "https://bumicerts.local").searchParams.get("tab");
      return currentTab ? currentTab === tabName : tab.href === tabs[0]?.href;
    }

    if (
      accountKind === "user" &&
      tab.href === paths.bumicerts &&
      pathname === paths.home
    ) {
      return true;
    }

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
                {tab.label}

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
