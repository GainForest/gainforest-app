"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

function buildTabs(
  did: string,
  accountKind: AccountTabBarKind,
  isOwner: boolean,
): Tab[] {
  const settingsTab: Tab = {
    label: "Settings",
    href: accountSettingsPath(did),
    icon: SettingsIcon,
    exact: false,
  };

  if (accountKind === "user") {
    const tabs: Tab[] = [
      {
        label: "Bumicerts",
        href: accountBumicertsPath(did),
        icon: BadgeIcon,
        exact: false,
      },
      {
        label: "Donation History",
        href: accountDonationsPath(did),
        icon: HeartIcon,
        exact: false,
      },
    ];
    if (isOwner) tabs.push(settingsTab);
    return tabs;
  }

  const tabs: Tab[] = [
    {
      label: "Home",
      href: accountPath(did),
      icon: HomeIcon,
      exact: true,
    },
    {
      label: "Bumicerts",
      href: accountBumicertsPath(did),
      icon: BadgeIcon,
      exact: false,
    },
    {
      label: "Evidence Timeline",
      href: accountTimelinePath(did),
      icon: ActivityIcon,
      exact: false,
    },
  ];
  if (isOwner) tabs.push(settingsTab);
  return tabs;
}

interface OrgTabBarProps {
  did: string;
  accountKind?: AccountKind;
  isOwner?: boolean;
}

export function AccountTabBar({
  did,
  accountKind = "organization",
  isOwner = false,
}: OrgTabBarProps) {
  const pathname = usePathname() ?? "/";
  const tabs = buildTabs(did, accountKind, isOwner);

  function isActive(tab: Tab): boolean {
    if (
      accountKind === "user" &&
      tab.href === accountBumicertsPath(did) &&
      pathname === accountPath(did)
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
