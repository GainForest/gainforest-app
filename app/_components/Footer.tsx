"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";
const DONATE_URL = "https://donorbox.org/gainforest";

// Dark footer — matches gainforest.earth's near-black footer.
//
// Expanded in the gainforest.earth merge (May 2026) to include the
// legal information block the upstream marketing site carries: legal
// entity name, Zurich address, contact email, tax status + UID, bank
// IBAN for direct donations, and the same "Work with us / Support us"
// pills the upstream footer ships. Without this block GainForest e.V.
// can't accept tax-exempt donations through this domain — which was
// flagged as a regression vs. gainforest.earth.
//
// Layout: three rows.
//   ┌─────────────────────────────────────────────────────────────┐
//   │ LOGO   GainForest   © 2026  All rights reserved        nav  │
//   ├─────────────────────────────────────────────────────────────┤
//   │ legal entity + address + email + UID │ Work with us pill    │
//   │                                       │ Support us pill     │
//   ├─────────────────────────────────────────────────────────────┤
//   │ Tax status + bank IBAN / BIC                                │
//   └─────────────────────────────────────────────────────────────┘
//
// All on the SAME ink background so the closing chord (NatureCTA →
// Footer) reads as one tall dark band, matching gainforest.earth's
// rhythm.
export function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink text-ink-foreground border-t border-ink-border">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-10 px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        {/* Top row: brand mark + product nav. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
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
            {/* Hover lifts to brand mint — single moment of subtle
                brand colour without committing to a mint button. */}
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

        <div className="h-px w-full bg-ink-border" />

        {/* Legal block. Address + email + tax status sit on the left
            (the upstream marketing footer's structure); two pill links
            mirror gainforest.earth's "Work with us" + "Support us" on
            the right. */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="flex flex-col gap-1.5 text-[13.5px] leading-[1.55] text-ink-foreground/75">
            <span className="font-garamond text-[16px] text-ink-foreground">
              {t("footer.legal.entity")}
            </span>
            <address className="not-italic">
              {t("footer.legal.address")}
            </address>
            <Link
              href={`mailto:${t("footer.legal.email")}`}
              className="text-ink-foreground/80 underline-offset-4 transition-colors hover:text-brand hover:underline"
            >
              {t("footer.legal.email")}
            </Link>
            <span className="mt-1 text-ink-foreground/55">
              {t("footer.legal.tax")} ·{" "}
              <Link
                href="https://www.uid.admin.ch/Detail.aspx?uid_id=CHE181901605"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-4 transition-colors hover:text-brand hover:underline"
              >
                {t("footer.legal.uid")}
              </Link>
            </span>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4 lg:flex-col lg:items-end">
            <Link
              href="https://www.gainforest.earth/#contact"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[44px] items-center justify-center rounded-full border border-ink-foreground/30 px-6 text-[13.5px] font-medium text-ink-foreground transition-colors hover:border-ink-foreground/70"
            >
              {t("footer.legal.work")}
            </Link>
            <Link
              href={DONATE_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-[44px] items-center justify-center gap-2 rounded-full bg-ink-foreground px-6 text-[13.5px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
            >
              {t("footer.legal.support")}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        {/* Bank IBAN block. Smallest type on the page — it's reference
            information, not a CTA. Single line on desktop, wraps on
            mobile. */}
        <div className="border-t border-ink-border pt-6 text-[12px] leading-[1.6] text-ink-foreground/50">
          {t("footer.legal.bank")}
        </div>
      </div>
    </footer>
  );
}
