"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import QuickTooltip from "@/components/ui/quick-tooltip";
import {
  fetchTrustedOrganizationBadges,
  type TrustedOrganizationBadge,
} from "../_lib/indexer";
import { accountHref } from "../_lib/urls";

// `endorser` is the certified handle of the org behind each badge, so the
// emblem can link to that endorser's own account page.
const BADGE_META: Record<TrustedOrganizationBadge, { label: string; src: string; endorser: string }> = {
  gainforest: { label: "GainForest", src: "/assets/media/images/gainforest-logo.svg", endorser: "gainforest.certified.one" },
  maearth: { label: "Ma Earth", src: "/assets/media/images/badges/ma-earth-logo.webp", endorser: "ma-earth-tqzc.certified.one" },
  biometrust: { label: "Biome Trust", src: "/assets/media/images/badges/biome-trust-logo.webp", endorser: "biome-trust.certified.one" },
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
  variant?: "default" | "compact" | "plain";
};

export function TrustedByBadges({
  did,
  className = "",
  labelClassName = "",
  iconClassName = "",
  size,
  variant = "default",
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
  const isPlain = variant === "plain";
  const resolvedSize = size ?? (variant === "compact" ? "xs" : "md");
  // "plain" drops the pill chrome (no rounded background, blur, or check icon)
  // so the endorsement reads as a quiet "Trusted by ●" line under the title.
  const variantClass = variant === "compact"
    ? "gap-1.5 rounded-full bg-accent/50 p-0.5 pl-2 text-sm"
    : isPlain
      ? "gap-2 text-sm"
      : "gap-2 rounded-full bg-accent/50 p-1 pl-3 text-lg";
  const checkIconClass = variant === "compact" ? "size-4" : "size-5";

  return (
    <span
      className={`${isPlain ? "flex" : "inline-flex"} min-w-0 items-center overflow-hidden font-medium text-muted-foreground ${isPlain ? "" : "backdrop-blur-lg"} ${variantClass} ${className}`}
      aria-label={t("aria", { names })}
    >
      {isPlain ? null : <BadgeCheckIcon className={`${checkIconClass} shrink-0 text-primary`} aria-hidden />}
      <span className={`shrink-0 whitespace-nowrap leading-none ${labelClassName}`}>{t("trustedBy")}</span>
      <span className="inline-flex shrink-0 items-center -space-x-1">
        {badges.map((badge) => {
          const meta = BADGE_META[badge];
          const pixels = ICON_PIXEL_SIZE[resolvedSize];
          const emblemClass = `grid ${ICON_SIZE_CLASS[resolvedSize]} place-items-center overflow-hidden rounded-full bg-background shadow-sm ring-1 ring-border/70 ${iconClassName}`;
          const emblemImage = (
            <Image
              src={meta.src}
              width={pixels}
              height={pixels}
              alt=""
              className="h-full w-full object-contain"
            />
          );
          return (
            <QuickTooltip key={badge} content={t("aria", { names: meta.label })} asChild>
              {isPlain ? (
                // Only the plain (account-hero) variant lives outside a clickable
                // card, so it's the one place we can safely nest a link without
                // putting an <a> inside the card's <button>.
                <Link
                  href={accountHref(meta.endorser)}
                  aria-label={t("aria", { names: meta.label })}
                  onClick={(event) => event.stopPropagation()}
                  className={`${emblemClass} relative cursor-pointer transition hover:z-10 hover:ring-2 hover:ring-primary focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                >
                  {emblemImage}
                </Link>
              ) : (
                <span className={emblemClass}>{emblemImage}</span>
              )}
            </QuickTooltip>
          );
        })}
      </span>
    </span>
  );
}
