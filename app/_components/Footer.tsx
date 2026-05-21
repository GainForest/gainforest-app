"use client";

import Link from "next/link";
import { BUMICERTS_URL, GLOBE_URL } from "../_lib/urls";
import { LogoMark } from "./Logo";
import { useT } from "./LocaleProvider";

const DONATE_URL = "https://donorbox.org/gainforest";
// Mailchimp-hosted subscribe form. Opens in a new tab; we deliberately
// don't embed the form on-page to keep the footer minimal and avoid a
// cross-origin script load just to capture an email.
const NEWSLETTER_URL =
  "https://earth.us12.list-manage.com/subscribe?u=09c1244bf2d2f8ad97ddb99b2&id=6e01ef6c4e";
// Social profiles. Linked from the bottom of the footer as a small
// icon trio next to the legal block. Kept inline SVG so they follow
// `currentColor` and don't need an extra HTTP request or icon package.
const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/gainforest",
    // Simple Iconish Facebook glyph, viewBox 0 0 24 24.
    path: "M13.5 21v-7.5h2.6l.4-3h-3v-1.9c0-.9.3-1.5 1.6-1.5H17V4.4a22 22 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4v2.2H8v3h2.6V21h2.9z",
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/GainForestNow",
    // X / Twitter glyph (the new mark).
    path: "M18.2 3H21l-6.6 7.5L22 21h-6.2l-4.9-6.4L5.3 21H2.5l7-8L2 3h6.4l4.4 5.8L18.2 3zm-1.1 16.2h1.7L7 4.7H5.2l11.9 14.5z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/gainforest/",
    // Instagram glyph: rounded square + circle + dot. Composed of one
    // path so it stays a single fill.
    path: "M12 2.2c2.7 0 3 0 4.1.1 1 0 1.5.2 1.9.4.5.2.8.4 1.2.8.4.4.6.7.8 1.2.2.4.3.9.4 1.9.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1-.2 1.5-.4 1.9-.2.5-.4.8-.8 1.2-.4.4-.7.6-1.2.8-.4.2-.9.3-1.9.4-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1 0-1.5-.2-1.9-.4-.5-.2-.8-.4-1.2-.8a3.3 3.3 0 0 1-.8-1.2c-.2-.4-.3-.9-.4-1.9C2.2 15 2.2 14.7 2.2 12s0-3 .1-4.1c0-1 .2-1.5.4-1.9.2-.5.4-.8.8-1.2.4-.4.7-.6 1.2-.8.4-.2.9-.3 1.9-.4C7.7 2.2 8 2.2 12 2.2zm0 1.8c-2.7 0-3 0-4 .1-.9 0-1.4.2-1.7.3-.4.2-.7.3-1 .6-.3.3-.4.6-.6 1-.1.3-.3.8-.3 1.7-.1 1-.1 1.3-.1 4s0 3 .1 4c0 .9.2 1.4.3 1.7.2.4.3.7.6 1 .3.3.6.4 1 .6.3.1.8.3 1.7.3 1 .1 1.3.1 4 .1s3 0 4-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.3 1-.6.3-.3.4-.6.6-1 .1-.3.3-.8.3-1.7.1-1 .1-1.3.1-4s0-3-.1-4c0-.9-.2-1.4-.3-1.7-.2-.4-.3-.7-.6-1-.3-.3-.6-.4-1-.6-.3-.1-.8-.3-1.7-.3-1-.1-1.3-.1-4-.1zm0 3.1a5 5 0 1 1 0 9.9 5 5 0 0 1 0-9.9zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm5.2-3.2a1.2 1.2 0 1 1 0 2.3 1.2 1.2 0 0 1 0-2.3z",
  },
] as const;

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
        <div className="grid gap-10 border-b border-ink-border pb-12 lg:grid-cols-[minmax(0,760px)_auto] lg:items-end lg:justify-between lg:gap-16">
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

          {/* Minimal CTA stack: one solid primary, two understated
              text links. No card chrome — the editorial type carries
              the weight, the donate pill is the only visual anchor. */}
          <div className="flex flex-col items-start gap-5 lg:items-end">
            <Link
              href={DONATE_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink-foreground px-7 text-[14px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
            >
              {t("natureCta.donate")}
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <div className="flex flex-col gap-3 text-[14px] text-ink-foreground/78 lg:items-end">
              <Link
                href={`${BUMICERTS_URL}/explore`}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
              >
                {t("natureCta.exploreProjects")}
                <span
                  aria-hidden
                  className="text-ink-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                >
                  →
                </span>
              </Link>
              <Link
                href={`${BUMICERTS_URL}/bumicert/create`}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
              >
                {t("natureCta.createBumicert")}
                <span
                  aria-hidden
                  className="text-ink-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                >
                  →
                </span>
              </Link>
              <Link
                href={NEWSLETTER_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
              >
                {t("natureCta.newsletter")}
                <span
                  aria-hidden
                  className="text-ink-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand"
                >
                  →
                </span>
              </Link>
            </div>
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

              {/* Social media icon row. Inline SVG glyphs that follow
                  `currentColor` so the brand-mint hover state lights
                  up cleanly on the dark footer. Sits beneath the
                  email so it reads as part of the brand block, not
                  the legal block. */}
              <ul
                role="list"
                aria-label="GainForest on social media"
                className="mt-2 flex items-center gap-4"
              >
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.label}>
                    <Link
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`GainForest on ${social.label}`}
                      className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-foreground/60 transition-colors hover:bg-ink-foreground/10 hover:text-brand"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d={social.path} />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
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
