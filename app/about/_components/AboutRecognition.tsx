"use client";

import Image from "next/image";
import { useLocale } from "../../_components/LocaleProvider";
import { getAboutT } from "../_messages";
import {
  SUPPORTER_LOGOS,
  supporterHeightFor,
} from "../../_lib/supporters";

// "Backed by friends who believe in this future." — recognition wall
// for the /about page.
//
// Reads the SAME canonical supporter list the landing's <Supporters />
// uses, so every supporter on this page is also on the landing's
// closing strip (and vice versa). The body copy intentionally does
// NOT name-drop any single supporter — every logo in the wall is
// listed below at equal optical weight (per-logo height tweaks
// matched to the landing), so the recognition reads as one collective
// thanks rather than a tiered list.
//
// Visual treatment mirrors <Supporters />: monochrome via
// `grayscale + multiply`, 0.62 opacity baseline, hover lifts to full
// presence. The grid uses `justify-start` instead of the landing's
// `justify-center` because /about's column is wider and centring 17
// logos in a wide wrap reads as scattered rather than ordered.

export function AboutRecognition() {
  const { locale } = useLocale();
  const t = getAboutT(locale);

  return (
    <section
      aria-label="Recognition"
      className="border-t border-border-soft bg-background"
    >
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              {t("about.recognition.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[50px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {t("about.recognition.heading")}
            </h2>
          </div>
          <p className="text-[15px] lg:text-[16.5px] leading-[1.6] text-foreground/70 lg:col-span-5">
            {t("about.recognition.body")}
          </p>
        </div>

        {/* Full supporter wall — every logo from the canonical list,
            rendered at uniform optical weight. The `gap-x-12 gap-y-10`
            spacing is a touch more generous than the landing's strip
            so the wall breathes against the body copy above. */}
        <ul
          role="list"
          className="mt-14 flex flex-wrap items-center justify-start gap-x-10 gap-y-9 lg:mt-20 lg:gap-x-14 lg:gap-y-12"
        >
          {SUPPORTER_LOGOS.map((l) => {
            const h = supporterHeightFor(l.src);
            return (
              <li
                key={l.src}
                className="flex items-center"
                style={{ height: h }}
              >
                <Image
                  src={l.src}
                  alt={l.alt}
                  width={l.w}
                  height={l.h}
                  className="opacity-[0.62] transition-opacity duration-200 ease-out hover:opacity-100"
                  style={{
                    height: h,
                    width: "auto",
                    filter: "grayscale(1) contrast(1.05)",
                    mixBlendMode: "multiply",
                  }}
                  draggable={false}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
