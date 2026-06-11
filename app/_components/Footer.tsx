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
// icon trio next to the legal block. Inline SVG so they follow
// `currentColor` and don't need an extra HTTP request or icon
// package. All three glyphs come from the Bootstrap Icons set
// (MIT licensed, viewBox 0 0 16 16) so they share the same visual
// weight — the earlier ad-hoc 24x24 paths for Facebook + X were
// fine, but the matching Instagram path looked off (rounded-square
// chrome got too thin against the camera glyph). Bootstrap's set
// renders cleanly at 16px.
const SOCIAL_LINKS = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/gainforest",
    // bi-facebook (Bootstrap Icons, MIT)
    path: "M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951",
  },
  {
    label: "X (Twitter)",
    href: "https://x.com/GainForestNow",
    // bi-twitter-x (Bootstrap Icons, MIT)
    path: "M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/gainforest/",
    // bi-instagram (Bootstrap Icons, MIT) — user-supplied correction
    // from /Users/david/Downloads/instagram.svg.
    path: "M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334",
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
                href={`${BUMICERTS_URL}/bumicerts`}
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
                        viewBox="0 0 16 16"
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
              href={`${BUMICERTS_URL}/bumicerts`}
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
