"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// Dark footer — matches gainforest.earth's near-black footer.
//
// Editorial port: the previous cream footer blended into the cream
// NatureCTA section above it. Switching to ink (with the dark NatureCTA
// directly above) produces one big dark "closing chord" that visually
// separates the page from the chrome below — the same beat
// gainforest.earth uses.
export function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink text-ink-foreground border-t border-ink-border">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-6 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:px-16 lg:py-12">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LogoMark className="h-7 w-7 text-brand" title="GainForest" />
          <span className="font-garamond text-[22px] font-semibold text-ink-foreground">
            GainForest
          </span>
          <span className="text-[13px] text-ink-foreground/55 lg:ml-4">
            © {year} GainForest. {t("footer.rights")}
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-ink-foreground/80 lg:gap-x-8">
          {/* Hover lifts to brand mint so the dark footer keeps a
              single moment of subtle brand colour without ever
              committing to a mint button. */}
          <Link
            href={GLOBE_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-brand"
          >
            {t("nav.globe")}
          </Link>
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-brand"
          >
            Bumicerts
          </Link>
          <Link
            href="https://github.com/GainForest/bumicerts-monorepo"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-brand"
          >
            GitHub
          </Link>
          <Link
            href="https://www.gainforest.earth"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-brand"
          >
            {t("footer.contact")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
