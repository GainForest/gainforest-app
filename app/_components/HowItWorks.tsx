"use client";

import Image from "next/image";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// Four-step "How it works" strip with thin arrows between steps, port of the
// mid-section in /Users/david/Downloads/02101890-2e05-463d-8151-44123926d31b.png.
const STEPS: ReadonlyArray<{
  icon: string;
  titleKey: MessageKey;
  bodyKey: MessageKey;
}> = [
  {
    icon: "/decor/icon-step-discover.png",
    titleKey: "howitworks.step1.title",
    bodyKey: "howitworks.step1.body",
  },
  {
    icon: "/decor/icon-step-understand.png",
    titleKey: "howitworks.step2.title",
    bodyKey: "howitworks.step2.body",
  },
  {
    icon: "/decor/icon-step-support.png",
    titleKey: "howitworks.step3.title",
    bodyKey: "howitworks.step3.body",
  },
  {
    icon: "/decor/icon-step-grow.png",
    titleKey: "howitworks.step4.title",
    bodyKey: "howitworks.step4.body",
  },
];

export function HowItWorks() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-16 pt-14 pb-14">
        <h2 className="font-garamond text-[44px] font-normal leading-[1.05] text-foreground">
          {t("howitworks.heading")}
        </h2>

        <ol className="mt-10 grid grid-cols-1 gap-y-12 sm:grid-cols-2 lg:flex lg:items-start lg:gap-0">
          {STEPS.map((step, i) => (
            <li
              key={step.titleKey}
              className="flex flex-1 items-start gap-5 lg:gap-4"
            >
              {/* numbered chip + icon column */}
              <div className="flex flex-col items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-background/60 font-garamond text-[13px] text-foreground/65">
                  {i + 1}
                </span>
                <div className="relative mt-3 h-[88px] w-[88px]">
                  <Image
                    src={step.icon}
                    alt=""
                    fill
                    sizes="88px"
                    className="object-contain"
                  />
                </div>
              </div>

              {/* title + body */}
              <div className="pt-7 lg:pt-7">
                <h3 className="font-garamond text-[22px] font-medium leading-tight text-foreground">
                  {t(step.titleKey)}
                </h3>
                <p className="mt-2 max-w-[210px] text-[13.5px] leading-relaxed text-foreground/65">
                  {t(step.bodyKey)}
                </p>
              </div>

              {/* connector arrow \u2014 hidden after the last item and on mobile */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden self-center pl-2 pr-4 text-[22px] text-foreground/30 lg:inline"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
