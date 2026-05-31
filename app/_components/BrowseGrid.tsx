import Link from "next/link";
import type { ExplorerKpis } from "../_lib/kpis";
import type { StatusSnapshot } from "../_lib/status";
import { formatCompact, formatUsd } from "../_lib/format";

// Home navigation grid. One card per explorer page, each with a live stat so
// the home screen doubles as a dashboard of the commons. Replaces the old
// single-page tab strip now that every section is its own route.
export function BrowseGrid({
  kpis,
  status,
}: {
  kpis: ExplorerKpis;
  status: StatusSnapshot;
}) {
  const operational = status.components.filter((c) => c.status === "OPERATIONAL").length;
  const total = status.components.length;

  const cards: Array<{
    href: string;
    label: string;
    title: string;
    blurb: string;
    stat: string;
    statLabel: string;
  }> = [
    {
      href: "/observations",
      label: "app.gainforest.dwc.occurrence",
      title: "Species observations",
      blurb: "Darwin Core occurrences: taxonomy, coordinates, and image/audio evidence blobs.",
      stat: formatCompact(kpis.occurrences),
      statLabel: "records",
    },
    {
      href: "/sites",
      label: "app.gainforest.organization.info",
      title: "Project sites",
      blurb: "Registered organizations: display name, country, and cover/logo blobs.",
      stat: formatCompact(kpis.sites),
      statLabel: "organizations",
    },
    {
      href: "/bumicerts",
      label: "org.hypercerts.claim.activity",
      title: "Bumicerts",
      blurb: "Impact claim activities: title, contributors, and certified locations.",
      stat: formatCompact(kpis.bumicerts),
      statLabel: "claims",
    },
    {
      href: "/donations",
      label: "org.hypercerts.funding.receipt",
      title: "Donations",
      blurb: "On-chain funding receipts aggregated: totals, donors, and transactions.",
      stat: formatUsd(kpis.totalRaised),
      statLabel: "raised",
    },
    {
      href: "/devices",
      label: "healthchecks.io",
      title: "Tainá devices",
      blurb: "Field Raspberry Pi heartbeats: status, CPU temp, RAM, disk, uptime.",
      stat: "Live",
      statLabel: "heartbeats",
    },
    {
      href: "/status",
      label: "instatus",
      title: "System status",
      blurb: "PDS instances, indexer, labeller, and apps; uptime per service.",
      stat: total > 0 ? `${operational}/${total}` : "—",
      statLabel: "operational",
    },
  ];

  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="font-garamond text-[26px] font-normal leading-none text-foreground sm:text-[32px]">
            Collections
          </h2>
          <span className="font-mono text-[12px] text-foreground/45">6 sources</span>
        </div>

        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-border-soft bg-background p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_44px_-26px_rgba(20,30,15,0.4)]"
              >
                <div>
                  <span className="font-instrument text-[12px] uppercase tracking-[0.2em] text-foreground/50">
                    {c.label}
                  </span>
                  <h3 className="mt-2 font-garamond text-[24px] leading-[1.1] text-foreground">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-[1.5] text-foreground/65">{c.blurb}</p>
                </div>
                <div className="flex items-end justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-garamond text-[28px] leading-none text-foreground">{c.stat}</span>
                    <span className="text-[12.5px] text-foreground/55">{c.statLabel}</span>
                  </div>
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-foreground/45 transition-all group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
