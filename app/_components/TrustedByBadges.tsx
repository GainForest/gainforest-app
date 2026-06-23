"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QuickTooltip from "@/components/ui/quick-tooltip";
import {
  fetchTrustedOrganizationBadges,
  type TrustedOrganizationBadge,
} from "../_lib/indexer";

const BADGE_META: Record<TrustedOrganizationBadge, { label: string; src: string }> = {
  gainforest: { label: "GainForest", src: "/assets/media/images/gainforest-logo.svg" },
  maearth: { label: "Ma Earth", src: "/assets/media/images/badges/ma-earth-logo.webp" },
};

const ICON_SIZE_CLASS = {
  xs: "h-6 w-6",
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-10 w-10",
} as const;

const ICON_PIXEL_SIZE = {
  xs: 24,
  sm: 28,
  md: 32,
  lg: 40,
} as const;

type TrustedByBadgesProps = {
  did: string;
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
  size?: keyof typeof ICON_SIZE_CLASS;
};

export function TrustedByBadges({
  did,
  className = "",
  labelClassName = "",
  iconClassName = "",
  size = "md",
}: TrustedByBadgesProps) {
  const t = useTranslations("common.trust");
  const [badges, setBadges] = useState<TrustedOrganizationBadge[]>([]);

  useEffect(() => {
    setBadges([]);
    if (!did.startsWith("did:")) return;

    let active = true;
    const controller = new AbortController();
    fetchTrustedOrganizationBadges(did, controller.signal)
      .then((nextBadges) => {
        if (active) setBadges(nextBadges);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError" && active) setBadges([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [did]);

  if (badges.length === 0) return null;

  const names = badges.map((badge) => BADGE_META[badge].label).join(", ");

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground ${className}`}
      aria-label={t("aria", { names })}
    >
      <span className={`shrink-0 whitespace-nowrap ${labelClassName}`}>{t("trustedBy")}</span>
      <span className="inline-flex shrink-0 items-center -space-x-1">
        {badges.map((badge) => {
          const meta = BADGE_META[badge];
          const pixels = ICON_PIXEL_SIZE[size];
          return (
            <QuickTooltip key={badge} content={t("aria", { names: meta.label })} asChild>
              <span
                className={`grid ${ICON_SIZE_CLASS[size]} place-items-center overflow-hidden rounded-full bg-background shadow-sm ring-1 ring-border/70 ${iconClassName}`}
              >
                <Image
                  src={meta.src}
                  width={pixels}
                  height={pixels}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </span>
            </QuickTooltip>
          );
        })}
      </span>
    </span>
  );
}
