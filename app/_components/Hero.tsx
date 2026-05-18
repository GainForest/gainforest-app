"use client";

import Link from "next/link";
import Image from "next/image";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Hero composition.
//
// Two distinct layouts driven by Tailwind responsive utilities:
//
//   - lg+: the original split-column desktop layout. The live Bumicerts +
//     Globe windows render at the page level (see `app/page.tsx`) with
//     `position: absolute` against placeholder anchors inside this hero.
//
//   - below lg (tablet / phone): a single-column stacked composition.
//     Headline + subtitle + CTAs first, then the live windows
//     immediately underneath, full-width, stacked vertically. The
//     draggable absolute cards are hidden on mobile (wrapped in
//     `hidden lg:block` in page.tsx) and we mount the inline siblings
//     here so the user still sees the live data right under the hero.
export function Hero({
  snapshot: _snapshot,
  /** Inline cards rendered only on mobile (lg:hidden). Server-pulled
   *  data flows in from `app/page.tsx`. */
  inlineCards,
}: {
  snapshot: LiveBumicertsSnapshot;
  inlineCards?: React.ReactNode;
}) {
  void _snapshot;
  const t = useT();
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-4 px-6 pt-10 pb-10 sm:px-10 lg:px-16 lg:pt-16">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-6 pt-2">
          <h1 className="font-garamond text-[42px] sm:text-[58px] lg:text-[78px] font-normal leading-[1.05] lg:leading-[1.02] tracking-[-0.015em] text-foreground">
            {t("hero.title.line1")}
            <br />
            {t("hero.title.line2")}
          </h1>

          <p className="mt-5 lg:mt-7 max-w-[480px] text-[15px] lg:text-[16px] leading-[1.55] text-foreground/70">
            {t("hero.subtitle")}
          </p>

          <div className="mt-7 lg:mt-9 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[50px] lg:h-[54px] items-center justify-center rounded-[10px] bg-primary px-6 lg:px-9 text-[14px] lg:text-[15px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
            >
              {t("hero.cta.bumicerts")}
            </Link>
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[50px] lg:h-[54px] items-center justify-center rounded-[10px] border border-primary/35 bg-transparent px-6 lg:px-9 text-[14px] lg:text-[15px] font-medium text-primary transition-colors hover:bg-primary/5"
            >
              {t("hero.cta.globe")}
            </Link>
          </div>

          <p className="mt-5 lg:mt-6 max-w-[420px] text-[12px] leading-[1.55] text-foreground/45">
            {t("hero.footnote")}
          </p>

          {/* MOBILE-only live windows. Render inline beneath the hero
              copy so phone visitors see the same live data desktop
              visitors get from the floating, draggable cards. Hidden on
              lg+ where the draggable versions take over. */}
          {inlineCards && (
            <div className="mt-9 flex flex-col items-stretch gap-5 lg:hidden">
              {inlineCards}
            </div>
          )}
        </div>

        {/* RIGHT: composed layers (desktop only). The leaves bouquet is
            decorative weight in the gutter between text and cards; on
            tablet/phone it has nowhere to go without overpowering the
            content, so we hide it below lg. */}
        <div className="relative hidden lg:block lg:col-span-6 min-h-[480px]">
          {/* Tropical / rainforest botanical sprig. Trimmed asset aspect
              ratio ~0.37 (507×1376). */}
          <div className="pointer-events-none absolute -left-[18%] -top-4 h-[560px] w-[210px] z-0 opacity-85">
            <Image
              src="/decor/leaves.png"
              alt=""
              fill
              priority
              unoptimized
              className="object-contain object-center"
              sizes="210px"
            />
          </div>

          {/* Placeholder anchors for the two draggable cards. Both cards
              are rendered at the page level (`app/page.tsx`) so they can
              use document-coordinate `position: absolute` and scroll
              naturally with the rest of the page. The placeholders
              reserve their hero slots and give the client components a
              known starting position to read on mount.

              right-[-35px] pushes the Globe card past the column's right
              edge so the sphere ends up sitting ~25% behind the Bumicerts
              card and ~75% peeking out on the right. */}
          <div
            id="bumicerts-card-anchor"
            aria-hidden
            className="pointer-events-none absolute left-0 top-[140px] h-[360px] w-[400px]"
          />
          <div
            id="globe-card-anchor"
            aria-hidden
            className="pointer-events-none absolute right-[-35px] top-[20px] h-[360px] w-[280px]"
          />
        </div>
      </div>
    </section>
  );
}
