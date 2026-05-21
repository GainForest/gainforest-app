"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";

const BUMICERTS_URL = "https://alpha.fund.gainforest.app";
const DONATE_URL = "https://donorbox.org/gainforest";

// Closing CTA — "Nature thrives when we act together."
//
// This is the editorial DARK band, mirroring gainforest.earth's
// alternating cream/near-black section rhythm (data-commons and
// Nature-Guild sections both sit on near-black there). White serif
// headline with a single italic word, solid cream donate pill, and
// outlined secondary pills — all matching the gainforest.earth pattern.
//
// Removed:
//   - `/decor/topo-decor.png` — the topographic raster decoration. Its
//     organic ovals competed with the typography for the eye; the dark
//     band looks more confident with whitespace and the headline alone.
//   - The container's rounded border on cream — the dark band now spans
//     the full viewport so the page contrast lands hard, like
//     gainforest.earth's data-commons section.
export function NatureCTA() {
  const t = useT();
  const before = t("natureCta.heading.before").trim();
  const italic = t("natureCta.heading.italic").trim();
  const after = t("natureCta.heading.after").trim();

  return (
    <section className="bg-ink text-ink-foreground">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-10 px-6 py-20 sm:px-10 lg:flex-row lg:items-end lg:justify-between lg:gap-16 lg:px-16 lg:py-28">
        <div className="max-w-[760px]">
          <h2 className="font-garamond text-[36px] sm:text-[48px] lg:text-[60px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-foreground">
            {before && <span>{before} </span>}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h2>
          <p className="mt-6 max-w-[560px] text-[15px] lg:text-[17px] leading-[1.55] text-ink-foreground/75">
            {t("natureCta.body")}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-start lg:gap-3">
          {/* Primary pill on dark — cream solid on ink, the inverse of
              the sage primary CTA used on cream sections. */}
          <Link
            href={DONATE_URL}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-ink-foreground px-8 text-[15px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
          >
            {t("natureCta.donate")}
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
          {/* Outlined cream pills on ink, mirrors gainforest.earth's
              "Newsletter / GitBook / Friends of GainForest" footer
              pills. */}
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-ink-foreground/30 px-8 text-[15px] font-medium text-ink-foreground transition-colors hover:border-ink-foreground/80"
          >
            {t("natureCta.exploreProjects")}
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
          <Link
            href={`${BUMICERTS_URL}/bumicert/create`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-ink-foreground/30 px-8 text-[15px] font-medium text-ink-foreground transition-colors hover:border-ink-foreground/80"
          >
            {t("natureCta.createBumicert")}
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
