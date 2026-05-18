"use client";

import Image from "next/image";
import Link from "next/link";
import { useT } from "./LocaleProvider";

const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Nature thrives when we act together." closing CTA banner.
//
// The topographic contour decoration on the right is a raster image generated
// via gpt-image (`public/decor/topo-decor.png`) rather than inline SVG — the
// generated version has the organic hand-inked feel the reference mockup uses
// and the earlier hand-coded SVG ovals were too geometric.
export function NatureCTA() {
  const t = useT();
  return (
    <section className="px-6 pb-10 sm:px-10 lg:px-16 lg:pb-14">
      <div className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-6 overflow-hidden rounded-[18px] border border-border-soft bg-background/50 px-6 py-7 sm:px-10 sm:py-9 lg:flex-row lg:items-center lg:justify-between">
        {/* topographic contour decoration — generated raster, anchored on the
            right edge of the banner and bleeding off-page */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-[58%] opacity-30 lg:block"
        >
          <Image
            src="/decor/topo-decor.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 800px, 0px"
            className="object-cover object-right"
          />
        </div>

        <div className="relative z-10 max-w-[640px]">
          <h2 className="font-garamond text-[28px] sm:text-[34px] lg:text-[36px] font-normal leading-[1.1] text-foreground">
            {t("natureCta.heading")}
          </h2>
          <p className="mt-3 text-[14px] sm:text-[15px] leading-relaxed text-foreground/65">
            {t("natureCta.body")}
          </p>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[48px] items-center justify-center rounded-[10px] bg-primary px-7 text-[14px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
          >
            {t("natureCta.exploreProjects")}
          </Link>
          <Link
            href={`${BUMICERTS_URL}/create`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 text-[14px] font-medium text-primary"
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
