"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BUMICERTS_URL, GLOBE_URL } from "../_lib/urls";
import { LivePill } from "./LivePill";
import { useT } from "./LocaleProvider";

// Client wrapper for ChoosePath's translatable strings + interactive
// chrome. The server wrapper in ChoosePath.tsx renders the async
// <GlobeCard> JSX and passes it in as `globe` so the spinning sphere
// stays a server component while every other piece of copy in the
// section flows through i18n.
//
// Why a single client component (instead of N small ChoosePathLabels
// slots): there is a lot of paired copy here (eyebrow + heading +
// body + CTA, plus per-Bumicert chrome) and threading every string
// through a slot would multiply the parent JSX without making the
// section easier to read or translate.

export type FeaturedBumicert = {
  id: string;
  title: string;
  imageUrl: string | null;
  shortDescription: string | null;
  href: string;
};

export function ChoosePathClient({
  featured,
  pinCount,
  isLive,
  globe,
}: {
  featured: ReadonlyArray<FeaturedBumicert>;
  pinCount: number;
  isLive: boolean;
  globe: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-14 lg:auto-rows-fr lg:grid-cols-2 lg:gap-8">
      {/* LEFT — Green Globe path. */}
      <div className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10">
        <div className="min-w-0">
          {/* Eyebrow row mirrors the Bumicerts card: eyebrow label on
              the left, unified <LivePill /> on the right. Keeps the
              live indicator in one consistent slot across both cards. */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
              {t("choosePath.globe.eyebrow")}
            </span>
            <LivePill
              isLive
              tooltipKey="choosePath.globe.liveTooltip"
            />
          </div>
          <h3 className="mt-3 font-garamond text-[24px] lg:text-[28px] font-normal leading-[1.15] text-foreground">
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              {t("choosePath.globe.heading")}
            </Link>
          </h3>
          <p className="mt-3 max-w-[420px] text-[14.5px] leading-[1.55] text-foreground/70">
            {t("choosePath.globe.body")}
          </p>
        </div>

        <div className="flex flex-1 items-center">
          <GlobePreview pinCount={pinCount}>{globe}</GlobePreview>
        </div>

        <Link
          href={GLOBE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={t("choosePath.globe.cta")}
          className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary self-start"
        >
          <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
            {t("choosePath.globe.cta")}
          </span>
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>

      {/* RIGHT — Bumicerts fan. */}
      <div className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10">
        <div className="min-w-0">
          {/* Eyebrow row: label on the left, unified <LivePill /> on
              the right — same slot and styling as the Globe card. */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
              {t("choosePath.bumicerts.eyebrow")}
            </span>
            <LivePill
              isLive={isLive}
              tooltipKey={
                isLive
                  ? "choosePath.bumicerts.liveTooltip"
                  : "choosePath.bumicerts.fallbackTooltip"
              }
            />
          </div>
          <h3 className="mt-3 font-garamond text-[24px] lg:text-[28px] font-normal leading-[1.15] text-foreground">
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              {t("choosePath.bumicerts.heading")}
            </Link>
          </h3>
          <p className="mt-3 max-w-[420px] text-[14.5px] leading-[1.55] text-foreground/70">
            {t("choosePath.bumicerts.body")}
          </p>
        </div>

        {featured.length > 0 && (
          <div className="flex flex-1 items-center">
            <BumicertFan featured={featured} />
          </div>
        )}

        <Link
          href={`${BUMICERTS_URL}/explore`}
          target="_blank"
          rel="noreferrer"
          aria-label={t("choosePath.bumicerts.cta")}
          className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary self-start"
        >
          <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
            {t("choosePath.bumicerts.cta")}
          </span>
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-1"
          >
            →
          </span>
        </Link>
      </div>
    </div>
  );
}

function GlobePreview({
  pinCount,
  children,
}: {
  pinCount: number;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative flex w-full items-center justify-center">
        <div className="cursor-grab active:cursor-grabbing">{children}</div>
        {/* The absolute LIVE chip that used to overlay the globe canvas
            was removed when the unified <LivePill /> moved into the
            card's eyebrow row — keeps a single live indicator per card
            in a consistent position. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/55 backdrop-blur-sm"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />
          </svg>
          {t("choosePath.globe.dragHint")}
        </span>
      </div>

      {/* Caption strip below the globe — used to show
          "{n}+ PROJECTS · DATA.GAINFOREST.APP" but the host string
          read as technical noise (asymmetric with the Bumicerts card,
          which had its own `org.hypercerts.claim` lexicon noise that
          we also stripped). The pin count alone is the meaningful
          signal; the link to the full globe lives in the CTA below. */}
      <div className="flex w-full items-center justify-center pt-1 text-[10.5px] uppercase tracking-[0.12em] text-foreground/50">
        <span>
          {t("choosePath.globe.caption.projects").replace(
            "{n}",
            String(pinCount),
          )}
        </span>
      </div>
    </div>
  );
}

function BumicertFan({
  featured,
}: {
  featured: ReadonlyArray<FeaturedBumicert>;
}) {
  return (
    <ul
      role="list"
      className="-mx-3.5 flex w-[calc(100%+1.75rem)] snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-3.5 pb-2 sm:mx-0 sm:w-full sm:snap-none sm:gap-3.5 sm:overflow-x-visible sm:px-0"
    >
      {featured.map((b) => (
        <li
          key={b.id}
          className="snap-center min-w-[150px] sm:min-w-0 sm:flex-1"
        >
          <BumicertCard b={b} />
        </li>
      ))}
    </ul>
  );
}

function BumicertCard({ b }: { b: FeaturedBumicert }) {
  const t = useT();
  return (
    <Link
      href={b.href}
      target="_blank"
      rel="noreferrer"
      className="group/card flex h-full flex-col overflow-hidden rounded-[10px] border border-[#e6dfd0] bg-background transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_10px_24px_-18px_rgba(40,50,30,0.30)]"
    >
      {b.imageUrl && (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#cfd9c4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
          />
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-background/95 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-brand-dark backdrop-blur-sm">
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="text-brand"
            >
              <path
                d="M9 12l2 2 4-4M12 22a10 10 0 110-20 10 10 0 010 20z"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("choosePath.bumicerts.verified")}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1.5 px-2.5 pt-2 pb-2 sm:px-3 sm:pt-2.5">
        <h4
          className="font-garamond text-[13px] font-medium leading-[1.2] text-foreground overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
          title={b.title}
        >
          {b.title}
        </h4>
        {b.shortDescription && (
          <p
            className="text-[11px] leading-[1.4] text-foreground/60 overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {b.shortDescription}
          </p>
        )}
        <div className="flex-1" />
        {/* Footer trust signal. Earlier iterations also rendered the
            literal ATProto NSID `org.hypercerts.claim` above this row,
            but the lexicon string read as jargon to visitors. The
            lightning + "ATProto signed" line carries the same trust
            signal in human-readable form. */}
        <div className="mt-1 flex items-center gap-1 border-t border-[#ece5d4] pt-1.5 text-[8.5px] uppercase tracking-[0.1em] text-foreground/45">
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="shrink-0"
          >
            <path
              d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t("choosePath.bumicerts.signed")}</span>
        </div>
      </div>
    </Link>
  );
}
