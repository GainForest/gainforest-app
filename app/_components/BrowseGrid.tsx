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
      label: "Darwin Core",
      title: "Species observations",
      blurb: "Photos, bioacoustics, and field data signed by communities and sensors.",
      stat: formatCompact(kpis.occurrences),
      statLabel: "records",
    },
    {
      href: "/sites",
      label: "Organizations",
      title: "Project sites",
      blurb: "The communities and organizations stewarding land in the commons.",
      stat: formatCompact(kpis.sites),
      statLabel: "organizations",
    },
    {
      href: "/bumicerts",
      label: "Hypercerts",
      title: "Bumicerts",
      blurb: "Verifiable proof-of-impact certificates, each backed by contributors.",
      stat: formatCompact(kpis.bumicerts),
      statLabel: "impact claims",
    },
    {
      href: "/donations",
      label: "Analytics",
      title: "Donations dashboard",
      blurb: "Live on-chain funding; totals, donors, and recent transactions.",
      stat: formatUsd(kpis.totalRaised),
      statLabel: "raised",
    },
    {
      href: "/devices",
      label: "Field infrastructure",
      title: "Tainá devices",
      blurb: "Liveness of the field Raspberry Pis running Tainá near Manaus.",
      stat: "Live",
      statLabel: "heartbeats",
    },
    {
      href: "/status",
      label: "Infrastructure",
      title: "System status",
      blurb: "The PDS instances, indexer, labeller, and apps behind the commons.",
      stat: total > 0 ? `${operational}/${total}` : "—",
      statLabel: "operational",
    },
  ];

  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="font-garamond text-[26px] font-normal leading-none text-foreground sm:text-[32px]">
            Browse the <span className="font-instrument italic">commons</span>
          </h2>
          <span className="text-[12.5px] text-foreground/50">Six live surfaces</span>
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
