"use client";

/**
 * Media tab bar for the Observations hub: Photos | Audio | Devices.
 *
 * Audio is a different medium, not a different job — so it lives as a tab
 * inside Observations rather than a separate sidebar destination. Devices is
 * a third tab because hardware is the only genuinely new object. Each tab is
 * a plain link between the three Observations surfaces; no state is shared.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, ImageIcon, RadioReceiverIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ObservationsMediaTabId = "photos" | "audio" | "devices";

const TABS: Array<{
  id: ObservationsMediaTabId;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "photos", href: "/observations", Icon: ImageIcon },
  { id: "audio", href: "/observations/audio", Icon: AudioLinesIcon },
  { id: "devices", href: "/observations/devices", Icon: RadioReceiverIcon },
];

export function ObservationsMediaTabs({ active }: { active: ObservationsMediaTabId }) {
  const t = useTranslations("common.observationsHub");

  return (
    <nav
      className="flex w-fit max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-full border border-border bg-card/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t("ariaLabel")}
    >
      {TABS.map(({ id, href, Icon }) => (
        <Link
          key={id}
          href={href}
          aria-current={active === id ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition-colors lg:px-4",
            active === id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {t(id)}
        </Link>
      ))}
    </nav>
  );
}
