"use client";

import Link from "next/link";
import { useT } from "./LocaleProvider";
import type { MessageKey } from "../_lib/i18n";

// The deeper-dive technical companion to this section. Linked as a
// quiet ledger entry beneath the subheading so curious visitors can
// jump from the 30-second narrative into the full documentation
// without crowding the editorial layout.
const DOCS_URL = "https://docs.gainforest.earth/";

// "How it works" — the four-step narrative.
//
// Editorial frame: most climate finance never reaches the grassroots,
// so we close that loop with local-first tech, community-owned data,
// and open protocols. The steps then mirror the actual flow that
// powers GainForest end-to-end — community-owned data → Bumicert →
// supporters discover → ATProto interop with allies like Ma Earth
// and Hypercerts. Earlier copy ("Discover / Understand / Support /
// Grow impact") only addressed the donor side; this rewrite is
// deliberately community-first.
//
// Visual pattern: clean horizontal strip of numbered cards connected
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
    <section id="how-it-works" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        <div className="grid grid-cols-1 gap-x-12 gap-y-4 lg:grid-cols-12">
          <h2 className="font-garamond text-[32px] sm:text-[40px] lg:text-[44px] font-normal leading-[1.1] tracking-[-0.01em] text-foreground lg:col-span-6">
            {t("howitworks.heading")}
          </h2>
          {/* Framing subhead — names the problem (finance not reaching
              grassroots) then the solution. Sits next to the heading on
              desktop, stacked below on mobile. Includes a quiet "Read
              the docs" link for the curious technical reader; the link
              sits below the subhead so it doesn't compete with the
              editorial copy. */}
          <div className="max-w-[520px] lg:col-span-6 lg:col-start-7 lg:mt-2">
            <p className="text-[15px] leading-[1.6] text-foreground/65">
              {t("howitworks.subheading")}
            </p>
            <Link
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="group/docs mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-primary"
            >
              <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover/docs:border-primary">
                {t("howitworks.docsCta")}
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover/docs:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        </div>

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
              {/* numbered chip — sits on top of the connector rail */}
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
