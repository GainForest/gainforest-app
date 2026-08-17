"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AudioLinesIcon, WavesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accountAudioPath, accountAudioSoundscapesPath } from "../_lib/account-route";

export type AudioSubTabId = "recordings" | "soundscapes";

/**
 * Recordings | Soundscapes — the two forms an account's audio takes on its
 * public profile. Recordings are the raw files as they came off the recorder;
 * soundscapes are the finished 24-hour portraits published from them. Both
 * views are public, so this row is the same for every visitor. Rendered as a
 * segmented control (the same shape as the Observations hub's media tabs) so
 * it reads as a level below the Photos | Audio pills above it.
 */
export function AudioSubTabs({ identifier, active }: { identifier: string; active: AudioSubTabId }) {
  const t = useTranslations("common.accountAudio");

  const tabs: Array<{
    id: AudioSubTabId;
    href: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "recordings", href: accountAudioPath(identifier), Icon: AudioLinesIcon },
    { id: "soundscapes", href: accountAudioSoundscapesPath(identifier), Icon: WavesIcon },
  ];

  return (
    <nav
      className="mt-3 flex w-fit max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-full border border-border bg-card/70 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t("viewsAria")}
    >
      {tabs.map(({ id, href, Icon }) => (
        <Link
          key={id}
          href={href}
          aria-current={active === id ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
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
