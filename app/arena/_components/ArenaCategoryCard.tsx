import Link from "next/link";
import { ExternalLinkIcon, type LucideIcon } from "lucide-react";

export type ArenaSampleLink = { href: string; label: string };

/** `at://did/collection/rkey` → `/observations/[did]/[rkey]`, or null. */
export function observationPathFromAtUri(uri: string): string | null {
  const match = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri);
  return match ? `/observations/${match[1]}/${match[2]}` : null;
}

/** Short monospace label for a sample observation, derived from its rkey. */
export function sampleLabel(uri: string): string {
  const rkey = uri.split("/").pop() ?? uri;
  return rkey.length > 14 ? `#${rkey.slice(0, 12)}…` : `#${rkey}`;
}

/** One open-work category card: icon + heading + queue count + sample links. */
export function ArenaCategoryCard({
  Icon,
  title,
  description,
  openCountLabel,
  examplesLabel,
  samples,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  /** Translated "{count} open" label for the queue badge. */
  openCountLabel: string;
  examplesLabel: string;
  samples: ArenaSampleLink[];
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-sm">
      <header className="border-b border-border/70 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
            <Icon className="size-4" />
          </span>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {openCountLabel}
          </span>
        </div>
        <p className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      <div className="px-4 py-3 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{examplesLabel}</p>
        {samples.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {samples.map((sample) => (
              <li key={sample.href}>
                <Link
                  href={sample.href}
                  className="inline-flex items-center gap-1.5 rounded-lg font-mono text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {sample.label}
                  <ExternalLinkIcon className="size-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
