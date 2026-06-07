import Link from "next/link";
import { ArrowUpRightIcon, LeafIcon } from "lucide-react";
import type { ExplorerKpis } from "../_lib/kpis";
import type { StatusSnapshot } from "../_lib/status";
import type { DevicesLiveSummary } from "../_lib/devices";
import { formatCompact, formatCompactUsd } from "../_lib/format";

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
      statLabel: "stories",
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
      blurb: "Explore species sightings, places, and photos or sounds from GainForest.",
      stat: formatCompact(kpis.occurrences),
      statLabel: "sightings",
    },
    {
      href: "/leaderboard",
      label: "Impact champions",
      title: "Leaderboard",
      blurb: "Celebrate the top contributors funding regenerative work across Bumicerts.",
      stat: formatCompactUsd(kpis.totalRaised),
      statLabel: "raised",
    },
    {
      href: "/devices",
      label: "Field signals",
      title: "Tainá devices",
      blurb: "Verify whether field devices are sending updates right now.",
      stat: devices.configured && devices.total > 0 ? `${devices.healthy}/${devices.total}` : "—",
      statLabel: devices.configured && devices.total > 0 ? "live now" : "heartbeats",
    },
    {
      href: "/status",
      label: "Site health",
      title: "Site health",
      blurb: "See whether the services behind Bumicerts and GainForest are working.",
      stat: total > 0 ? `${operational}/${total}` : "—",
      statLabel: "working",
    },
  ];

  return (
    <section className="bg-background px-6 pt-10 pb-14 sm:px-12 sm:pt-12 md:px-6 md:pt-10 md:pb-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center md:mb-8">
          <div className="mb-4 flex items-center justify-center gap-3 text-primary/60">
            <span className="h-px w-8 bg-border" />
            <LeafIcon className="size-4" />
            <span className="h-px w-8 bg-border" />
          </div>
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">
            Ways to Explore
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            Six live views into GainForest work, shaped for funders, stewards, and field teams.
          </p>
        </div>

        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="group block h-full">
                <div className="relative flex h-full min-h-[230px] flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
                  {/* Soft primary glow that warms up on hover — borrowed from the app's card accents. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/5 blur-2xl transition-all duration-500 group-hover:bg-primary/10"
                  />

                  <div className="relative">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-primary/70" />
                      {card.label}
                    </span>
                    <h3 className="font-instrument mt-4 text-3xl italic leading-tight tracking-[-0.01em] text-foreground">
                      {card.title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-6 text-muted-foreground">{card.blurb}</p>
                  </div>

                  <div className="relative mt-8 flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <span className="block text-3xl font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
                        {card.stat}
                      </span>
                      <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {card.statLabel}
                      </span>
                    </div>
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary backdrop-blur-sm transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowUpRightIcon className="size-5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
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
