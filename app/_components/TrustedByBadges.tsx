"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import QuickTooltip from "@/components/ui/quick-tooltip";
import {
  fetchTrustedByEndorsements,
  type TrustedByEndorsement,
  type TrustedOrganizationBadge,
} from "../_lib/indexer";
import { accountHref } from "../_lib/urls";

// The three built-in brands ship with a bundled logo. `endorser` is the
// certified handle of the org behind each badge, so the emblem can link to that
// endorser's own account page. Admin-added endorsers have no bundled logo —
// they render from their own certified profile (avatar + name) instead.
const BADGE_META: Record<TrustedOrganizationBadge, { label: string; src: string; endorser: string }> = {
  gainforest: { label: "GainForest", src: "/assets/media/images/gainforest-logo.svg", endorser: "gainforest.certified.one" },
  maearth: { label: "Ma Earth", src: "/assets/media/images/badges/ma-earth-logo.webp", endorser: "ma-earth-tqzc.certified.one" },
};

type EndorserCard = { avatarUrl: string | null; handle: string | null; displayName: string | null };

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
  const [endorsements, setEndorsements] = useState<TrustedByEndorsement[]>([]);
  const [cards, setCards] = useState<Record<string, EndorserCard>>({});

  useEffect(() => {
    setEndorsements([]);
    if (!did.startsWith("did:")) return;

    let active = true;
    const controller = new AbortController();
    fetchTrustedByEndorsements(did, controller.signal)
      .then((next) => {
        if (active) setEndorsements(next);
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError" && active) setEndorsements([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [did]);

  // Resolve avatars/handles for dynamic endorsers (the built-ins use bundled
  // logos and hardcoded handles, so they never need a lookup).
  useEffect(() => {
    const missing = endorsements
      .filter((endorsement) => !endorsement.builtin && endorsement.endorserDid)
      .map((endorsement) => endorsement.endorserDid as string)
      .filter((endorserDid) => !(endorserDid in cards));
    if (missing.length === 0) return;

    let active = true;
    Promise.all(
      missing.map(async (endorserDid) => {
        const response = await fetch(`/api/account/card?did=${encodeURIComponent(endorserDid)}`).catch(() => null);
        const card = response?.ok ? ((await response.json().catch(() => null)) as EndorserCard | null) : null;
        return [endorserDid, card ?? { avatarUrl: null, handle: null, displayName: null }] as const;
      }),
    ).then((entries) => {
      if (active) setCards((previous) => ({ ...previous, ...Object.fromEntries(entries) }));
    });

    return () => {
      active = false;
    };
  }, [endorsements, cards]);

  if (endorsements.length === 0) return null;

  const labelFor = (endorsement: TrustedByEndorsement) =>
    endorsement.builtin ? BADGE_META[endorsement.builtin].label : endorsement.label;
  const names = endorsements.map(labelFor).join(", ");
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
        {endorsements.map((endorsement) => {
          const label = labelFor(endorsement);
          const pixels = ICON_PIXEL_SIZE[resolvedSize];
          const emblemClass = `grid ${ICON_SIZE_CLASS[resolvedSize]} place-items-center overflow-hidden rounded-full bg-background shadow-sm ring-1 ring-border/70 ${iconClassName}`;

          const card = endorsement.endorserDid ? cards[endorsement.endorserDid] : undefined;
          const logoSrc = endorsement.builtin ? BADGE_META[endorsement.builtin].src : card?.avatarUrl ?? null;
          const emblemImage = logoSrc ? (
            <Image src={logoSrc} width={pixels} height={pixels} alt="" unoptimized={!endorsement.builtin} className="h-full w-full object-contain" />
          ) : (
            // No logo/avatar yet: fall back to the endorser's initial.
            <span className="text-xs font-semibold uppercase text-muted-foreground">{label.slice(0, 1)}</span>
          );

          const endorserHandle = endorsement.builtin
            ? BADGE_META[endorsement.builtin].endorser
            : endorsement.endorserHandle ?? endorsement.endorserDid;

          return (
            <QuickTooltip key={endorsement.key} content={t("aria", { names: label })} asChild>
              {isPlain && endorserHandle ? (
                // Only the plain (account-hero) variant lives outside a clickable
                // card, so it's the one place we can safely nest a link without
                // putting an <a> inside the card's <button>.
                <Link
                  href={accountHref(endorserHandle)}
                  aria-label={t("aria", { names: label })}
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
