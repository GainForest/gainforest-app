"use client";

// Showcase project card, adopted from researchretreat's "cabin booking" card
// (Dribbble shot 25800072): a portrait full-bleed photo, rounded frosted chips
// and a white pill CTA. The text area sits on a *progressive blur* — the photo
// stays sharp up top and gets increasingly frosted toward the bottom (stacked
// backdrop-filter layers with gradient masks) with only a whisper of dark tint
// for legibility. Subtle pointer-tracking 3D tilt + glare. Clicking flies the
// photo into the project page hero via a cross-route View Transition
// (useViewTransitionNavigate + the shared name from view-transition.ts).

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { FolderKanbanIcon, Loader2Icon, MapPinIcon, RibbonIcon, StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BumicertOwnerAvatar } from "@/components/bumicert/BumicertOwnerAvatar";
import { usePreferredDidIdentifier } from "../../_components/PreferredLinks";
import { useViewTransitionNavigate } from "../../_components/ViewTransitionRouter";
import {
  PROJECT_MEDIA_TRANSITION_CLASS,
  projectMediaTransitionName,
} from "../../_lib/view-transition";
import { buildWorkScopeLabels, formatWorkScopeTag } from "../../_lib/work-scope-labels";
import { countryName, formatCompactUsd } from "../../_lib/format";
import { isPdsBlobUrl } from "../../_lib/pds";
import { localProjectHref } from "../../_lib/urls";
import type { ProjectRecord } from "../../_lib/indexer";

const SPRING = { stiffness: 160, damping: 18, mass: 0.6 };

/** The slice of the explorer's donation summary the card actually shows. */
export type ShowcaseDonationSummary = {
  acceptsDonations: boolean;
  totalUsd: number;
  donorCount: number;
  gainforestDonation: object | null;
  maEarth: { rounds: number[] } | null;
};

/**
 * Stacked gradient-masked backdrop-blur layers ≈ progressive blur. Each layer
 * covers a shorter band with a stronger blur; the masks fade each band in
 * gently so the frost ramps up with no visible seam.
 */
const BLUR_LAYERS = [
  { height: "68%", blur: 3, fadeStop: "32%" },
  { height: "58%", blur: 8, fadeStop: "38%" },
  { height: "48%", blur: 16, fadeStop: "42%" },
  { height: "36%", blur: 26, fadeStop: "48%" },
];

function ProgressiveBlur({ tint }: { tint: string }) {
  return (
    <>
      {BLUR_LAYERS.map((layer, index) => {
        const mask = `linear-gradient(to bottom, transparent 0%, black ${layer.fadeStop}, black 100%)`;
        return (
          <span
            key={index}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 block"
            style={{
              height: layer.height,
              backdropFilter: `blur(${layer.blur}px)`,
              WebkitBackdropFilter: `blur(${layer.blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
      {/* Gentle tint so white text stays legible on bright photos — the blur
          is doing most of the work, so keep it light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 block"
        style={{ height: BLUR_LAYERS[0].height, background: tint }}
      />
    </>
  );
}

export function ProjectShowcaseCard({
  record,
  priority,
  index,
  onFilterOwner,
  donationSummary,
  canManageFeatured = false,
  featured = false,
  featureBusy = false,
  onToggleFeatured,
  isRewilding = false,
  className,
  isActive = true,
  frozen = false,
}: {
  record: ProjectRecord;
  priority: boolean;
  index: number;
  onFilterOwner?: (did: string) => void;
  donationSummary?: ShowcaseDonationSummary;
  canManageFeatured?: boolean;
  featured?: boolean;
  featureBusy?: boolean;
  onToggleFeatured?: (record: ProjectRecord) => void;
  /** Part of the Rewilding the Web grant — shows an icon-only indicator pill
   *  whose label appears on hover. */
  isRewilding?: boolean;
  /** Extra classes on the outer wrapper — lets carousels size/snap the card. */
  className?: string;
  /** Side-preview cards in the coverflow are inert + untilted. */
  isActive?: boolean;
  /** True while the coverflow is being dragged: hover zoom, tilt and glare
   * are suspended so the photo moves rigidly with the card. */
  frozen?: boolean;
}) {
  const t = useTranslations("marketplace.projects.card");
  const ownerFilterT = useTranslations("marketplace.ownerFilter");
  const featuredT = useTranslations("marketplace.projects.featured.manage");
  const rewildingT = useTranslations("marketplace.projects.rewilding");
  const workScopeT = useTranslations("common.workScopes");
  const workScopeLabels = useMemo(() => buildWorkScopeLabels(workScopeT), [workScopeT]);

  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(record.imageUrl) && !imgError;
  const ownerName = record.creatorName ?? t("projectSteward");
  const canFilterOwner = Boolean(onFilterOwner) && Boolean(record.did);
  const place = countryName(record.country);
  const identifier = usePreferredDidIdentifier(record.did);
  const href = localProjectHref(identifier, record.rkey);
  const navigate = useViewTransitionNavigate();
  const reduceMotion = useReducedMotion() ?? false;

  const totalUsd = donationSummary?.totalUsd ?? 0;
  const donorCount = donationSummary?.donorCount ?? 0;
  const hasDonationAmount = totalUsd > 0 && donorCount > 0;
  const maEarthRounds = donationSummary?.maEarth?.rounds ?? [];
  const acceptsGainForestDonations = Boolean(
    donationSummary?.gainforestDonation || record.donationSources?.gainforest,
  );
  const acceptsAnyDonations = Boolean(donationSummary?.acceptsDonations || record.acceptsDonations);
  // One quiet chip at most: the donation line when there is one, otherwise the
  // project's primary focus tag — the page itself tells the rest.
  const scopeTags = hasDonationAmount ? [] : (record.scopeTags ?? []).slice(0, 1);

  // ── Pointer tilt + glare (researchretreat HypercertCard) ─────────────
  const cardRef = useRef<HTMLAnchorElement>(null);
  const mediaRef = useRef<HTMLSpanElement>(null);
  const rotateXRaw = useMotionValue(0);
  const rotateYRaw = useMotionValue(0);
  const glareXRaw = useMotionValue(50);
  const glareYRaw = useMotionValue(35);
  const rotateX = useSpring(rotateXRaw, SPRING);
  const rotateY = useSpring(rotateYRaw, SPRING);
  const glareX = useSpring(glareXRaw, { stiffness: 120, damping: 20 });
  const glareY = useSpring(glareYRaw, { stiffness: 120, damping: 20 });
  const glare = useMotionTemplate`radial-gradient(360px circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.20), rgba(255,255,255,0.05) 42%, transparent 70%)`;
  // Flatten the tilt the instant a navigation starts so the departing
  // snapshot isn't captured mid-rotation.
  const [departing, setDeparting] = useState(false);

  function onPointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    const el = cardRef.current;
    if (!el || reduceMotion || departing || frozen || !isActive || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    rotateYRaw.set(px * 10);
    rotateXRaw.set(-py * 8);
    glareXRaw.set((px + 0.5) * 100);
    glareYRaw.set((py + 0.5) * 100);
  }
  function resetTilt() {
    rotateXRaw.set(0);
    rotateYRaw.set(0);
    glareXRaw.set(50);
    glareYRaw.set(35);
  }
  useEffect(() => {
    // Flatten any in-flight tilt the moment a drag or navigation starts.
    if (departing || frozen) resetTilt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departing, frozen]);

  const handleNavigate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab, download…) behave like a normal link.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setDeparting(true);
    navigate(href, {
      element: mediaRef.current,
      name: projectMediaTransitionName(record.did, record.rkey),
      transitionClass: PROJECT_MEDIA_TRANSITION_CLASS,
      // Only wait for the destination hero when this project has a photo the
      // hero will actually render — otherwise the wait could only time out.
      readySelector: hasImage ? "[data-vt-project-media]" : undefined,
    });
  };

  const stopThrough = (event: ReactMouseEvent | ReactKeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div style={{ perspective: 1400 }} className={cn("@container h-full animate-in", className)} data-testid="project-showcase-card">
      <motion.a
        ref={cardRef}
        href={href}
        onClick={handleNavigate}
        onPointerMove={onPointerMove}
        onPointerLeave={resetTilt}
        whileHover={reduceMotion || departing || frozen || !isActive ? undefined : { scale: 1.02 }}
        whileTap={reduceMotion || departing || frozen || !isActive ? undefined : { scale: 0.99 }}
        transition={{ type: "spring", ...SPRING }}
        aria-label={t("open", { title: record.title })}
        tabIndex={isActive ? undefined : -1}
        aria-hidden={!isActive}
        className="group relative block aspect-[5/8] h-full w-full cursor-pointer rounded-[20px] text-start shadow-[0_22px_44px_-22px_rgba(0,0,0,0.45),0_10px_18px_-12px_rgba(0,0,0,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          animationDelay: `${Math.min(index, 10) * 35}ms`,
        }}
      >
        {/* Shared-element photo → morphs into the project page hero */}
        <span ref={mediaRef} className="absolute inset-0 block overflow-hidden rounded-[20px] bg-muted">
          {hasImage ? (
            <Image
              src={record.imageUrl!}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
              priority={priority}
              fetchPriority={priority ? "high" : "auto"}
              unoptimized={!isPdsBlobUrl(record.imageUrl)}
              onError={() => setImgError(true)}
              className={cn(
                "object-cover",
                !reduceMotion && !frozen && "transition-transform duration-700 ease-out group-hover:scale-[1.06]",
              )}
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_18%,rgba(123,201,138,0.35),transparent_62%),linear-gradient(160deg,#22402d_0%,#101d15_100%)] text-white/25">
              <FolderKanbanIcon className="h-10 w-10" aria-hidden strokeWidth={1.25} />
            </span>
          )}
          <ProgressiveBlur tint="linear-gradient(to bottom, transparent 0%, rgba(10,14,10,0.18) 30%, rgba(10,14,10,0.52) 62%, rgba(10,14,10,0.78) 100%)" />
          <span
            aria-hidden
            className="absolute inset-0 block rounded-[20px]"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)" }}
          />
        </span>

        {/* Pointer glare (not part of the shared element) */}
        {!reduceMotion && !frozen ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 block rounded-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: glare }}
          />
        ) : null}

        {/* Floating content */}
        <span
          className="absolute inset-0 flex flex-col justify-between p-3"
          style={{ transform: "translateZ(40px)", transformStyle: "preserve-3d" }}
        >
          <span className="flex items-start justify-between gap-2">
            <span
              {...(canFilterOwner
                ? {
                    role: "button" as const,
                    tabIndex: 0,
                    "aria-label": ownerFilterT("filterByThis"),
                    title: ownerFilterT("filterByThis"),
                    onClick: (event: ReactMouseEvent) => {
                      stopThrough(event);
                      onFilterOwner?.(record.did);
                    },
                    onKeyDown: (event: ReactKeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") {
                        stopThrough(event);
                        onFilterOwner?.(record.did);
                      }
                    },
                  }
                : {})}
              className={cn(
                "inline-flex min-w-0 max-w-[65%] items-center gap-1.5 rounded-full border border-white/20 bg-black/30 py-0.5 ps-0.5 pe-2 text-[10px] font-medium text-white/90 backdrop-blur-md @max-[12rem]:pe-0.5",
                canFilterOwner && "cursor-pointer transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
              )}
            >
              <BumicertOwnerAvatar
                did={record.did}
                avatarRef={record.creatorAvatarRef}
                label={ownerName}
                className="h-4.5 w-4.5 shrink-0 ring-1 ring-white/40"
              />
              {/* On very narrow cards (2-up phone grid) the avatar alone
                  carries the identity — the name would just truncate away. */}
              <span className="min-w-0 truncate @max-[12rem]:hidden">{ownerName}</span>
            </span>

            <span className="flex shrink-0 flex-col items-end gap-1.5">
              {isRewilding ? (
                <span
                  aria-label={rewildingT("indicator")}
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-black/30 text-white/90 backdrop-blur-md"
                >
                  <RibbonIcon className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
              {acceptsGainForestDonations ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-white/20 bg-black/30 py-0.5 ps-1 pe-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-md">
                  <Image src="/assets/media/images/gainforest-logo.svg" width={12} height={12} alt="" className="h-3 w-3 shrink-0 object-contain" />
                  {t("donate")}
                </span>
              ) : null}
              {maEarthRounds.length > 0 ? (
                <span className="whitespace-nowrap rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/85 backdrop-blur-md">
                  {t("round", { round: maEarthRounds[maEarthRounds.length - 1]! })}
                </span>
              ) : !acceptsGainForestDonations && acceptsAnyDonations ? (
                <span className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-900 backdrop-blur-md">
                  {t("donate")}
                </span>
              ) : null}
              {canManageFeatured ? (
                <span
                  role="button"
                  tabIndex={featureBusy ? -1 : 0}
                  aria-pressed={featured}
                  aria-disabled={featureBusy}
                  aria-label={featured ? featuredT("remove") : featuredT("add")}
                  title={featured ? featuredT("remove") : featuredT("add")}
                  onClick={(event) => {
                    stopThrough(event);
                    if (!featureBusy) onToggleFeatured?.(record);
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && !featureBusy) {
                      stopThrough(event);
                      onToggleFeatured?.(record);
                    }
                  }}
                  className={cn(
                    "grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-white/25 bg-black/30 text-white/85 backdrop-blur-md transition hover:scale-105 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                    featured && "border-amber-300/70 text-amber-300",
                    featureBusy && "cursor-wait opacity-70",
                  )}
                >
                  {featureBusy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <StarIcon className={cn("h-3.5 w-3.5", featured && "fill-current")} aria-hidden />}
                </span>
              ) : null}
            </span>
          </span>

          <span className="block">
            {place ? (
              <span className="mb-1 flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
                <MapPinIcon className="h-2.5 w-2.5" aria-hidden />
                {place}
              </span>
            ) : null}
            <span className="line-clamp-2 font-instrument text-[19px] italic leading-[1.08] text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)] @max-[12rem]:text-[16px]">
              {record.title}
            </span>
            {record.shortDescription ? (
              <span className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                {record.shortDescription}
              </span>
            ) : null}

            {(hasDonationAmount || scopeTags.length > 0) ? (
              <span className="mt-2 flex flex-wrap gap-1">
                {hasDonationAmount ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9.5px] tracking-wide text-white/90 backdrop-blur-md">
                    <span className="font-semibold text-white">{formatCompactUsd(totalUsd)}</span>
                    <span className="text-white/65">&nbsp;{t("byDonors", { donors: donorCount })}</span>
                  </span>
                ) : null}
                {scopeTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9.5px] tracking-wide text-white/85 backdrop-blur-md"
                  >
                    {formatWorkScopeTag(tag, workScopeLabels)}
                  </span>
                ))}
              </span>
            ) : null}

            <span className="mt-3 block w-full rounded-full bg-white py-2 text-center text-[12px] font-medium tracking-wide text-neutral-900 transition group-hover:bg-white/90 @max-[12rem]:py-1.5 @max-[12rem]:text-[11px]">
              {t("view")}
            </span>
          </span>
        </span>
      </motion.a>
    </div>
  );
}
