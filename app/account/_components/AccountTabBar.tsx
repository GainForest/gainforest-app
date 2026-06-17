"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeIcon, HeartIcon, HomeIcon, ImageIcon, LeafIcon, SettingsIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import type { AccountKind } from "../_lib/account-route";
import {
  accountBumicertsPath,
  accountDonationsPath,
  accountGalleryPath,
  accountObservationsPath,
  accountPath,
  accountSettingsPath,
} from "../_lib/account-route";

type TabLabelKey = "home" | "bumicerts" | "donationHistory" | "observations" | "gallery" | "settings";

interface Tab {
  labelKey: TabLabelKey;
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
  activity: string;
  gallery: string;
  settings: string;
};

function buildTabPaths(did: string, scope: AccountTabBarScope, manageBasePath = "/manage"): TabPaths {
  if (scope === "manage") {
    return {
      home: `${manageBasePath}?tab=home`,
      bumicerts: `${manageBasePath}?tab=bumicerts`,
      donations: `${manageBasePath}?tab=donations`,
      activity: `${manageBasePath}?tab=observations`,
      gallery: `${manageBasePath}?tab=gallery`,
      settings: `${manageBasePath}?tab=settings`,
    };
  }

  return {
    home: accountPath(did),
    bumicerts: accountBumicertsPath(did),
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
  manageBasePath?: string,
): Tab[] {
  const paths = buildTabPaths(did, scope, manageBasePath);
  const settingsTab: Tab = {
    labelKey: "settings",
    href: paths.settings,
    icon: SettingsIcon,
    exact: false,
  };

  if (accountKind === "user") {
    const tabs: Tab[] = [
      {
        labelKey: "bumicerts",
        href: paths.bumicerts,
        icon: BadgeIcon,
        exact: false,
      },
      {
        labelKey: "donationHistory",
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
      labelKey: "home",
      href: paths.home,
      icon: HomeIcon,
      exact: true,
    },
    {
      labelKey: "bumicerts",
      href: paths.bumicerts,
      icon: BadgeIcon,
      exact: false,
    },
    {
      labelKey: "observations",
      href: paths.activity,
      icon: LeafIcon,
      exact: false,
    },
  ];
  if (scope === "account") {
    tabs.push({
      labelKey: "gallery",
      href: paths.gallery,
      icon: ImageIcon,
      exact: false,
    });
  }
  if (includeSettings) tabs.push(settingsTab);
  return tabs;
}

interface OrgTabBarProps {
  did: string;
  accountKind?: AccountKind;
  scope?: AccountTabBarScope;
  includeSettings?: boolean;
  manageBasePath?: string;
}

export function AccountTabBar({
  did,
  accountKind = "organization",
  scope = "account",
  includeSettings = false,
  manageBasePath,
}: OrgTabBarProps) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const searchParams = useSearchParams();
  const tabs = buildTabs(did, accountKind, scope, includeSettings, manageBasePath);
  const paths = buildTabPaths(did, scope, manageBasePath);

  function isActive(tab: Tab): boolean {
    if (scope === "manage") {
      const currentTab = searchParams.get("tab");
      const tabName = new URL(tab.href, "https://certs.local").searchParams.get("tab");
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
