"use client";

import Link from "next/link";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";
const DONATE_URL = "https://donorbox.org/gainforest";

// Integrated closing footer.
// The earlier page rendered a full-height closing CTA followed by a
// separate legal footer, which duplicated support actions and made the
// final ink band feel heavy. This component merges the closing prompt,
// primary actions, product navigation, legal contact, and bank details
// into one compact editorial surface.
export function Footer() {
  const t = useT();
  const year = new Date().getFullYear();
  const before = t("natureCta.heading.before").trim();
  const italic = t("natureCta.heading.italic").trim();
  const after = t("natureCta.heading.after").trim();

  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-14 sm:px-10 lg:px-16 lg:py-16">
        <div className="grid gap-8 border-b border-ink-border pb-10 lg:grid-cols-[minmax(0,760px)_minmax(320px,390px)] lg:items-end lg:justify-between lg:gap-16">
          <div>
            <h2 className="font-garamond text-[34px] font-normal leading-[1.05] tracking-[-0.01em] text-ink-foreground sm:text-[46px] lg:text-[56px]">
              {before && <span>{before} </span>}
              <span className="font-instrument font-normal italic">
                {italic}
              </span>
              {after && (after === "." ? after : <span> {after}</span>)}
            </h2>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-ink-foreground/72 lg:text-[16px]">
              {t("natureCta.body")}
            </p>
          </div>

          <div className="rounded-[28px] border border-ink-foreground/12 bg-ink-foreground/[0.035] p-3 shadow-[inset_0_1px_0_rgba(244,239,228,0.06)] sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={DONATE_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink-foreground px-6 text-[14px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
              >
                {t("natureCta.donate")}
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
              <Link
                href={`${BUMICERTS_URL}/explore`}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-ink-foreground/26 px-6 text-[14px] font-medium text-ink-foreground transition-colors hover:border-ink-foreground/75"
              >
                {t("natureCta.exploreProjects")}
                <span
                  aria-hidden
                  className="transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
            <Link
              href={`${BUMICERTS_URL}/bumicert/create`}
              target="_blank"
              rel="noreferrer"
              className="group mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium text-ink-foreground/70 transition-colors hover:text-brand"
            >
              {t("natureCta.createBumicert")}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-12">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <LogoMark className="h-7 w-7 text-brand" title="GainForest" />
              <span className="font-garamond text-[22px] font-semibold text-ink-foreground">
                GainForest
              </span>
              <span className="text-[13px] text-ink-foreground/52 lg:ml-2">
                © {year} GainForest. {t("footer.rights")}
              </span>
            </div>

            <div className="mt-5 flex max-w-[760px] flex-col gap-1.5 text-[13px] leading-[1.55] text-ink-foreground/64">
              <span>
                <span className="font-garamond text-[16px] text-ink-foreground/92">
                  {t("footer.legal.entity")}
                </span>
                <span className="text-ink-foreground/35"> · </span>
                {t("footer.legal.address")}
              </span>
              <span>
                {t("footer.legal.tax")} <span className="text-ink-foreground/35">·</span>{" "}
                <Link
                  href="https://www.uid.admin.ch/Detail.aspx?uid_id=CHE181901605"
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-4 transition-colors hover:text-brand hover:underline"
                >
                  {t("footer.legal.uid")}
                </Link>
              </span>
              <Link
                href={`mailto:${t("footer.legal.email")}`}
                className="w-fit text-ink-foreground/78 underline-offset-4 transition-colors hover:text-brand hover:underline"
              >
                {t("footer.legal.email")}
              </Link>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-ink-foreground/78 lg:max-w-[420px] lg:justify-end lg:gap-x-7">
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
              href="https://www.gainforest.earth/#contact"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-brand"
            >
              {t("footer.legal.work")}
            </Link>
            <Link
              href={`mailto:${t("footer.legal.email")}`}
              className="transition-colors hover:text-brand"
            >
              {t("footer.contact")}
            </Link>
          </nav>
        </div>

        <details className="group mt-7 border-t border-ink-border pt-5 text-[12.5px] leading-[1.6] text-ink-foreground/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] font-medium text-ink-foreground/62 transition-colors hover:text-ink-foreground [&::-webkit-details-marker]:hidden">
            <span>{t("footer.legal.bankLabel")}</span>
            <span aria-hidden className="text-ink-foreground/35 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-[960px]">{t("footer.legal.bank")}</p>
        </details>
      </div>
    </footer>
  );
}
