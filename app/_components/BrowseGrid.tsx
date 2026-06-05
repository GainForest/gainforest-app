import Link from "next/link";
import { ArrowUpRightIcon, LeafIcon } from "lucide-react";
import type { ExplorerKpis } from "../_lib/kpis";
import type { StatusSnapshot } from "../_lib/status";
import type { DevicesLiveSummary } from "../_lib/devices";
import { formatCompact, formatUsd } from "../_lib/format";

// Landing-page collections grid. Kept intentionally aligned to the Bumicerts
// home sections: max-w-6xl, centered editorial heading, rounded cards, and the
// same restrained primary accents instead of the old wide dashboard band.
export function BrowseGrid({
  kpis,
  status,
  devices,
}: {
  kpis: ExplorerKpis;
  status: StatusSnapshot;
  devices: DevicesLiveSummary;
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
      href: "/bumicerts",
      label: "Verified projects",
      title: "Bumicerts",
      blurb: "Browse verified impact stories with photos, places, contributors, and project context.",
      stat: formatCompact(kpis.bumicerts),
      statLabel: "claims",
    },
    {
      href: "/organizations",
      label: "Nature stewards",
      title: "Organizations",
      blurb: "Find the communities and organizations caring for ecosystems around the world.",
      stat: formatCompact(kpis.sites),
      statLabel: "profiles",
    },
    {
      href: "/observations",
      label: "Biodiversity",
      title: "Observations",
      blurb: "Explore species records, coordinates, and media evidence from the data commons.",
      stat: formatCompact(kpis.occurrences),
      statLabel: "records",
    },
    {
      href: "/leaderboard",
      label: "Impact champions",
      title: "Leaderboard",
      blurb: "Celebrate the top contributors funding regenerative work across Bumicerts.",
      stat: formatUsd(kpis.totalRaised),
      statLabel: "raised",
    },
    {
      href: "/devices",
      label: "Field signals",
      title: "Tainá devices",
      blurb: "Check live field-device heartbeats, temperature, memory, disk, and uptime.",
      stat: devices.configured && devices.total > 0 ? `${devices.healthy}/${devices.total}` : "—",
      statLabel: devices.configured && devices.total > 0 ? "live now" : "heartbeats",
    },
    {
      href: "/status",
      label: "Infrastructure",
      title: "System status",
      blurb: "See the PDS instances, indexer, labeller, and apps powering the explorer.",
      stat: total > 0 ? `${operational}/${total}` : "—",
      statLabel: "online",
    },
  ];

  return (
    <section className="bg-background px-6 pt-4 pb-12 sm:px-12 md:px-6 md:pt-8 md:pb-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center md:mb-8">
          <div className="mb-4 flex items-center justify-center gap-3 text-primary/60">
            <span className="h-px w-8 bg-border" />
            <LeafIcon className="size-4" />
            <span className="h-px w-8 bg-border" />
          </div>
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">
            Collections
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Six live views into the GainForest data commons, shaped for funders, stewards, and field teams.
          </p>
        </div>

        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full">
                <div className="flex h-full min-h-[230px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-lg shadow-foreground/5 transition-all duration-500 hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl">
                  <div>
                    <span className="inline-flex rounded-full bg-background/80 px-3 py-1 text-xs font-bold tracking-[0.12em] text-primary uppercase shadow-sm">
                      {card.label}
                    </span>
                    <h3 className="font-garamond mt-4 text-4xl leading-[1.05] font-light tracking-[-0.015em] text-foreground">
                      {card.title}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">{card.blurb}</p>
                  </div>

                  <div className="mt-8 flex items-end justify-between gap-4 border-t border-border/70 pt-4">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-garamond text-3xl leading-none font-light text-foreground">
                        {card.stat}
                      </span>
                      <span className="text-xs text-muted-foreground">{card.statLabel}</span>
                    </div>
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                      Open
                      <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
