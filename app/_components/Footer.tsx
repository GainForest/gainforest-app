"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

export function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col items-start gap-4 px-6 py-5 text-[13px] sm:px-10 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LogoMark className="h-6 w-6 text-primary" title="GainForest" />
          <span className="font-garamond text-[18px] font-semibold text-foreground">
            GainForest
          </span>
          <span className="text-foreground/55 lg:ml-4">
            © {year} GainForest. {t("footer.rights")}
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-foreground/80 lg:gap-10">
          <Link href="https://gainforest.app" target="_blank" rel="noreferrer">
            {t("nav.globe")}
          </Link>
          <Link
            href="https://alpha.fund.gainforest.app/explore"
            target="_blank"
            rel="noreferrer"
          >
            Bumicerts
          </Link>
          <Link
            href="https://github.com/GainForest/bumicerts-monorepo"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </Link>
          <Link
            href="https://www.gainforest.earth"
            target="_blank"
            rel="noreferrer"
          >
            {t("footer.contact")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
