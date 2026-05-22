"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { ML_ARTEFACTS, pickLocale } from "../_data";

// "Open models, open datasets." — companion grid to ResearchEcosystem,
// scoped to the ML artefacts behind the papers in the carousel.
// Whereas the ATProto block names protocol surfaces, this one names
// channels (HuggingFace, GitHub, arXiv, PDS) so an ML reader can
// see at a glance where each artefact actually lives.
//
// Visually mirrors ResearchEcosystem (same five-row grid, same
// hairline-top divider, same italic role line and arrow affordance)
// but inverts the surface: cream background, foreground text. The
// page rhythm becomes:
//   Hero (cream) → Publications (cream) → Ecosystem (INK) →
//   Models (cream) → Closing (cream)
// The ink-band stays as the only dark beat in the page body, with
// the dark Footer landing it at the bottom. Two consecutive ink
// bands would over-darken the lower half.
export function ResearchModels() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.models.heading.before").trim();
  const italic = t("research.models.heading.italic").trim();
  const after = t("research.models.heading.after").trim();

  return (
    <section
      id="models"
      className="scroll-mt-20 border-t border-border-soft bg-background lg:scroll-mt-24"
    >
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 gap-10 px-6 py-16 sm:px-10 sm:py-20 lg:grid-cols-12 lg:items-start lg:gap-16 lg:px-16 lg:py-28">
        <div className="lg:col-span-5">
          <span className="font-instrument italic text-[14px] uppercase tracking-[0.18em] text-foreground/55">
            {t("research.models.eyebrow")}
          </span>
          <h2 className="mt-5 font-garamond text-[32px] sm:text-[44px] lg:text-[56px] font-normal leading-[1.06] tracking-[-0.01em] text-foreground">
            {before && (
              <Fragment>
                <span>{before}</span>{" "}
              </Fragment>
            )}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h2>
          <p className="mt-6 max-w-[480px] text-[15px] lg:text-[16.5px] leading-[1.6] text-foreground/72">
            {t("research.models.subheading")}
          </p>
        </div>

        <ul
          role="list"
          className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:col-span-7 lg:gap-y-8"
        >
          {ML_ARTEFACTS.map((raw) => {
            const a = pickLocale(raw, locale);
            const content = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-garamond text-[22px] font-normal leading-[1.15] text-foreground lg:text-[26px]">
                    {a.name}
                  </h3>
                  {a.href ? (
                    <span
                      aria-hidden
                      className="text-[16px] text-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-primary"
                    >
                      →
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-instrument italic text-[13.5px] text-foreground/55">
                  {a.channel}
                </p>
                <p className="mt-3 text-[14.5px] leading-[1.55] text-foreground/72">
                  {a.body}
                </p>
              </>
            );

            return (
              <li key={a.id} className="border-t border-border-soft pt-5">
                {a.href ? (
                  <Link
                    href={a.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group block transition-colors hover:text-foreground"
                  >
                    {content}
                  </Link>
                ) : (
                  <div>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
