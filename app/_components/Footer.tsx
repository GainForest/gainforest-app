import Link from "next/link";
import { LogoMark } from "./Logo";
import { BUMICERTS_URL, GLOBE_URL, GAINFOREST_URL, STATUS_URL, INDEXER_URL } from "../_lib/urls";

const LINKS: Array<{ label: string; href: string }> = [
  { label: "Green Globe", href: GLOBE_URL },
  { label: "Bumicerts", href: `${BUMICERTS_URL}/explore` },
  { label: "Status", href: STATUS_URL },
  { label: "Indexer", href: INDEXER_URL },
  { label: "GitHub", href: "https://github.com/GainForest/gainforest-explorer" },
  { label: "gainforest.earth", href: GAINFOREST_URL },
];

// Slim technical footer. The brand mark, the data sources it reads, and a
// factual disclaimer. No editorial closing band.
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-border bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-[1480px] px-6 py-10 sm:px-10 lg:px-16">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[520px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <LogoMark className="h-6 w-6 text-brand" title="Bumiscan" />
              <span className="font-garamond text-[20px] font-semibold text-ink-foreground">
                Bumiscan
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-[1.6] text-ink-foreground/60">
              Read-only view over the GainForest data commons. Records resolve
              from Hyperindex and each owner&apos;s ATProto PDS; donation totals
              mirror the indexer and may lag the chain. Not an official record.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2.5 text-[13.5px] text-ink-foreground/78 lg:max-w-[420px] lg:justify-end">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-brand"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-1 border-t border-ink-border pt-5 text-[12px] text-ink-foreground/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} GainForest Foundation</span>
          <span className="font-mono">hi.gainforest.app/graphql · certified.one · instatus</span>
        </div>
      </div>
    </footer>
  );
}
