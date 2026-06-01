import Link from "next/link";
import { BrushedText } from "./BrushedText";
import { StatusPill } from "./StatusPill";
import type { ExplorerKpis } from "../_lib/kpis";
import type { StatusSnapshot } from "../_lib/status";
import type { DevicesLiveSummary } from "../_lib/devices";
import { formatCompact, formatUsd } from "../_lib/format";

// Editorial hero, same rhythm as gainforest-app: eyebrow, big Cormorant
// headline with one brushed word + one Instrument-Serif italic word, a short
// lede, the live status pill, and a four-up KPI band. All four numbers are
// prefetched server-side from the indexer.
export function Hero({
  kpis,
  status,
  devices,
}: {
  kpis: ExplorerKpis;
  status: StatusSnapshot;
  devices: DevicesLiveSummary;
}) {
  const cards: Array<{ value: string; label: string; sub: string }> = [
    {
      value: formatCompact(kpis.occurrences),
      label: "Species observations",
      sub: "Darwin Core records",
    },
    {
      value: formatCompact(kpis.bumicerts),
      label: "Bumicerts",
      sub: "Impact claim activities",
    },
    {
      value: formatCompact(kpis.sites),
      label: "Project sites",
      sub: "Registered organizations",
    },
    {
      value: formatUsd(kpis.totalRaised),
      label: "Funding raised",
      sub: "Across all Bumicerts",
    },
  ];

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-12 pb-10 sm:px-10 lg:px-16 lg:pt-20 lg:pb-14">
        <div className="max-w-[920px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-instrument text-[13px] uppercase tracking-[0.22em] text-foreground/55">
              Live · AT Protocol
            </span>
            <StatusPill snapshot={status} />
            {devices.configured && devices.total > 0 && (
              <Link
                href="/devices"
                className="group inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface px-3 py-1.5 text-[12.5px] font-medium transition-colors hover:border-foreground/25"
                title="Field Raspberry Pis running Tainá that are reporting up right now"
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
            Bumiscan is a read-only browser over the GainForest data commons —
            the indexer (Hyperindex) and the ATProto PDS instances behind it.
            Records, donations, and device health, queried live.
          </p>
        </div>

        {/* KPI band */}
        <ul
          role="list"
          className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-soft bg-border-soft lg:mt-14 lg:grid-cols-4"
        >
          {cards.map((c) => (
            <li key={c.label} className="bg-surface p-5 lg:p-7">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand text-brand"
                />
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark">
                  Live
                </span>
              </div>
              <div className="mt-2.5 font-garamond text-[34px] font-normal leading-[0.98] tracking-[-0.015em] text-foreground sm:text-[42px] lg:text-[52px]">
                {c.value}
              </div>
              <div className="mt-2 text-[14px] font-medium text-foreground lg:text-[15px]">
                {c.label}
              </div>
              <div className="text-[12.5px] text-foreground/55">{c.sub}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
