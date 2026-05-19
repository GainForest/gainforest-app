"use client";

import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// "How it works" — four-step explainer.
//
// Editorial rewrite: drop the hand-drawn `icon-step-*.png` set the team
// flagged as too thin-stroked and out of step with the rendered apps.
// What remains is a clean horizontal strip of numbered cards connected
// by a thin rule, in the spirit of gainforest.earth's "section block"
// rhythm — one idea per slot, no decoration.
const STEPS: ReadonlyArray<{
  titleKey: MessageKey;
  bodyKey: MessageKey;
}> = [
  {
    titleKey: "howitworks.step1.title",
    bodyKey: "howitworks.step1.body",
  },
  {
    titleKey: "howitworks.step2.title",
    bodyKey: "howitworks.step2.body",
  },
  {
    titleKey: "howitworks.step3.title",
    bodyKey: "howitworks.step3.body",
  },
  {
    titleKey: "howitworks.step4.title",
    bodyKey: "howitworks.step4.body",
  },
];

export function HowItWorks() {
  const t = useT();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground">
          {t("howitworks.heading")}
        </h2>

        {/* The thin horizontal rule (`before` pseudo on the parent) acts
            as the connector between numbered steps on desktop. On mobile
            each step stacks; the rule disappears. */}
        <ol className="relative mt-14 grid grid-cols-1 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0 lg:gap-x-10">
          {/* connector rail — desktop only, sits 24px from the top of
              each card so it threads through the numbered chips */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-[10px] hidden h-px bg-foreground/15 lg:block"
          />

          {STEPS.map((step, i) => (
            <li
              key={step.titleKey}
              className="relative flex flex-col"
            >
              {/* numbered chip — mint outline so it pops against the
                  cream and lines up with the connector rail */}
              <span className="relative z-10 inline-grid h-5 w-5 place-items-center rounded-full bg-background ring-1 ring-foreground/30 font-garamond text-[11px] text-foreground/80">
                {i + 1}
              </span>
              <h3 className="mt-5 font-garamond text-[22px] lg:text-[24px] font-normal leading-[1.15] text-foreground">
                {t(step.titleKey)}
              </h3>
              <p className="mt-3 max-w-[260px] text-[14px] leading-[1.55] text-foreground/65">
                {t(step.bodyKey)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
