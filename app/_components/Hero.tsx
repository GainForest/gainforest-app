import Link from "next/link";
import { BrushedText } from "./BrushedText";
import { StatusPill } from "./StatusPill";
import { KpiCard } from "./MetricTrend";
import type { ExplorerKpis } from "../_lib/kpis";
import type { ExplorerTrends, MetricSeries } from "../_lib/trends";
import type { StatusSnapshot } from "../_lib/status";
import type { DevicesLiveSummary } from "../_lib/devices";
import type { FormatKey, Baseline } from "./MetricTrend";
import { formatCompact, formatCompactUsd } from "../_lib/format";

// Editorial hero, same rhythm as gainforest-app: eyebrow, big Cormorant
// headline with one brushed word + one Instrument-Serif italic word, a short
// lede, the live status pill, and a four-up KPI band. All four numbers are
// prefetched server-side from the indexer.
export function Hero({
  kpis,
  trends,
  status,
  devices,
}: {
  kpis: ExplorerKpis;
  trends: ExplorerTrends;
  status: StatusSnapshot;
  devices: DevicesLiveSummary;
}) {
  const cards: Array<{
    value: string;
    label: string;
    sub: string;
    series?: MetricSeries | null;
    format?: FormatKey;
    baseline?: Baseline;
  }> = [
    {
      value: formatCompact(kpis.occurrences),
      label: "Species observations",
      sub: "Recent nature sightings",
      series: trends.observations,
      format: "number",
      // The full ~400k history can't be built at request time; show the recent
      // cumulative tail (newest 1000) anchored to the true total, framed to its
      // own range so the slope is visible.
      baseline: "min",
    },
    {
      value: formatCompact(kpis.bumicerts),
      label: "Certs",
      sub: "Verified project stories",
      series: trends.bumicerts,
      format: "number",
    },
    {
      value: formatCompact(kpis.sites),
      label: "Project sites",
      sub: "Nature stewardship groups",
      series: trends.sites,
      format: "number",
    },
    {
      value: formatCompactUsd(kpis.totalRaised),
      label: "Funding raised",
      sub: "Across all Certs",
      series: trends.totalRaised,
      format: "usd",
    },
  ];

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-12 pb-10 sm:px-10 lg:px-16 lg:pt-20 lg:pb-14">
        <div className="max-w-[920px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              Live updates
            </span>
            <StatusPill snapshot={status} />
            {devices.configured && devices.total > 0 && (
              <Link
                href="/devices"
                className="group inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-foreground/25"
                title="Field devices sending updates right now"
              >
                <span className={`relative inline-flex h-2 w-2 ${devices.healthy > 0 ? "text-ok" : "text-down"}`}>
                  <span
                    className={`inline-block h-2 w-2 rounded-full bg-current ${devices.healthy > 0 ? "pulse-dot" : ""}`}
                  />
                </span>
                <span className={devices.healthy > 0 ? "text-ok" : "text-down"}>
                  {devices.healthy}/{devices.total} Tainás live
                </span>
              </Link>
            )}
          </div>

          <h1 className="mt-5 font-garamond text-[44px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground sm:text-[64px] lg:text-[82px]">
            Bumi<BrushedText text="{scan}" />
          </h1>

          <p className="mt-6 max-w-[660px] text-[16px] leading-[1.55] text-foreground/80 lg:text-[18px]">
            GainForest helps anyone explore environmental work in plain language.
            See project stories, donations, field updates, and site health as they change.
          </p>
        </div>

        {/* KPI band */}
        <ul
          role="list"
          className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-soft bg-border-soft lg:mt-14 lg:grid-cols-4"
        >
          {cards.map((c) => (
            <KpiCard
              key={c.label}
              value={c.value}
              label={c.label}
              sub={c.sub}
              series={c.series}
              format={c.format}
              baseline={c.baseline}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
