"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { BinocularsIcon, MicIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { accountAudioPath, accountObservationsPath } from "../_lib/account-route";

type SubTabKey = "observations" | "audio";

interface SubTab {
  labelKey: SubTabKey;
  href: string;
  icon: React.ElementType;
}

/**
 * Secondary navigation for the Observations surface. Observations and Audio are
 * both field data, so they share one top-level "Observations" tab. Photos and
 * field sounds are the only two media kinds shown here; any measurements a
 * sighting carries (e.g. tree data) are displayed inline on the sighting itself
 * rather than as a separate tab. The Audio layer is private, so it only appears
 * to the account owner / organization manager (`showPrivate`); public visitors
 * just see the observations feed.
 */
export function ObservationsSubNav({ identifier, showPrivate }: { identifier: string; showPrivate: boolean }) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const observationsHref = accountObservationsPath(identifier);

  const tabs: SubTab[] = [
    { labelKey: "observations", href: observationsHref, icon: BinocularsIcon },
    ...(showPrivate
      ? ([{ labelKey: "audio", href: accountAudioPath(identifier), icon: MicIcon }] satisfies SubTab[])
      : []),
  ];

  // Nothing to switch between when only the observations feed is available.
  if (tabs.length <= 1) return null;

  function isActive(tab: SubTab): boolean {
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
  }

  return (
    <div className="mt-4 -mx-4 overflow-x-auto scrollbar-hidden px-4">
      <div className="flex min-w-max items-center gap-1.5">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.labelKey}
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
