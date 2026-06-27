"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { BinocularsIcon, DroneIcon, MicIcon, TreePineIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import {
  accountAudioPath,
  accountDronePath,
  accountObservationsPath,
  accountTreesPath,
} from "../_lib/account-route";

type SubTabKey = "observations" | "trees" | "audio" | "drone";

interface SubTab {
  labelKey: SubTabKey;
  href: string;
  icon: React.ElementType;
}

/**
 * Secondary navigation for the Observations surface. Observations, Trees, Audio
 * and Drone are all field data, so they share one top-level "Observations" tab
 * and switch between each other here. The Trees/Audio/Drone views are private,
 * so they only appear to the account owner / organization manager
 * (`showPrivate`); public visitors just see the observations feed with no
 * secondary nav.
 */
export function ObservationsSubNav({ identifier, showPrivate }: { identifier: string; showPrivate: boolean }) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");

  const tabs: SubTab[] = [
    { labelKey: "observations", href: accountObservationsPath(identifier), icon: BinocularsIcon },
    ...(showPrivate
      ? ([
          { labelKey: "trees", href: accountTreesPath(identifier), icon: TreePineIcon },
          { labelKey: "audio", href: accountAudioPath(identifier), icon: MicIcon },
          { labelKey: "drone", href: accountDronePath(identifier), icon: DroneIcon },
        ] satisfies SubTab[])
      : []),
  ];

  // Nothing to switch between when only the observations feed is available.
  if (tabs.length <= 1) return null;

  return (
    <div className="mt-4 -mx-4 overflow-x-auto scrollbar-hidden px-4">
      <div className="flex min-w-max items-center gap-1.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap select-none",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
