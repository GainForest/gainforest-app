"use client";

import { useT } from "./LocaleProvider";

// "Working with nature stewards globally." — port of gainforest.earth's
// "Our non-profit works with 50 nature partners globally" stat band.
//
// We don't ship a real partner logo wall (no permission + the logos
// would clash with the editorial tone), so this is a stat-driven
// editorial section: big serif heading + 50+ pull number + a calm
// ledger of partner archetypes (the same archetypes gainforest.earth's
// logo wall represents, just typed out).
const PARTNER_ARCHETYPES = [
  "Indigenous Councils",
  "Grassroots Cooperatives",
  "Ecological Labs",
  "Protected-Area Managers",
  "Academic Partners",
  "Climate Funds",
];

export function Partners() {
  const t = useT();
  const before = t("partners.heading.before").trim();
  const italic = t("partners.heading.italic").trim();
  const after = t("partners.heading.after").trim();
  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-7">
            <span className="font-instrument italic text-[13px] uppercase tracking-[0.18em] text-foreground/55">
              {t("partners.eyebrow")}
            </span>
            <h2 className="mt-4 font-garamond text-[32px] sm:text-[40px] lg:text-[48px] font-normal leading-[1.08] tracking-[-0.01em] text-foreground">
              {before && <span>{before} </span>}
              <span className="font-instrument italic font-normal">
                {italic}
              </span>
              {after && <span>{after}</span>}
            </h2>
            <p className="mt-6 max-w-[600px] text-[15px] lg:text-[16.5px] leading-[1.55] text-foreground/70">
              {t("partners.body")}
            </p>

            {/* Ledger of archetypes — small typographic list, two
                columns on desktop, single column on mobile. Hairline
                row separators keep it editorial rather than chip-like. */}
            <ul className="mt-10 grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-12">
              {PARTNER_ARCHETYPES.map((p, i) => (
                <li
                  key={p}
                  className="flex items-baseline justify-between border-b border-foreground/15 py-3"
                >
                  <span className="text-[14px] lg:text-[15px] text-foreground/80">
                    {p}
                  </span>
                  <span className="font-instrument italic text-[12px] text-foreground/45">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right column — big serif stat. Same shape as DataCommons'
              "1%" so the two stat-driven sections feel like siblings. */}
          <div className="lg:col-span-5 lg:flex lg:items-center lg:justify-end">
            <div className="flex flex-col gap-3 lg:items-end lg:text-right">
              <span
                aria-hidden
                className="font-garamond text-[120px] sm:text-[150px] lg:text-[200px] font-normal leading-[0.9] tracking-[-0.025em] text-foreground"
              >
                {t("partners.stat")}
              </span>
              <p className="max-w-[280px] text-[14px] lg:text-[14.5px] leading-[1.5] text-foreground/70">
                {t("partners.statLabel")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
