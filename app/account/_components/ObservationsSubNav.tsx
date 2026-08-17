"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { ImageIcon, MicIcon } from "lucide-react";
import { stripLocaleFromPathname } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";
import { accountAudioPath, accountObservationsPath } from "../_lib/account-route";

type SubTabKey = "photos" | "audio";

interface SubTab {
  labelKey: SubTabKey;
  href: string;
  icon: React.ElementType;
}

/**
 * Secondary navigation for the Observations surface. Photos and Audio are both
 * field data, so they share one top-level "Observations" tab. The sighting feed
 * is labelled "Photos" rather than "Observations" so the pill doesn't repeat the
 * name of the tab it sits under. Photos and field sounds are the only two media
 * kinds shown here; any measurements a sighting carries (e.g. tree data) are
 * displayed inline on the sighting itself rather than as a separate tab. Both
 * tabs are public — recordings live in public repos and the audio explore page
 * links every visitor to them — so the nav is the same for everyone.
 */
export function ObservationsSubNav({ identifier }: { identifier: string }) {
  const t = useTranslations("common.accountTabs");
  const pathname = stripLocaleFromPathname(usePathname() ?? "/");
  const observationsHref = accountObservationsPath(identifier);

  const tabs: SubTab[] = [
    { labelKey: "photos", href: observationsHref, icon: ImageIcon },
    { labelKey: "audio", href: accountAudioPath(identifier), icon: MicIcon },
  ];

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
