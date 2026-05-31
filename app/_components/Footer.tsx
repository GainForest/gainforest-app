import Link from "next/link";
import { LogoMark } from "./Logo";
import { BUMICERTS_URL, GLOBE_URL, GAINFOREST_URL, STATUS_URL } from "../_lib/urls";

// Integrated closing footer, adapted from gainforest-app's Footer onto the
// explorer's narrower surface. Dark ink band with the brand mark, a short
// editorial line, the source links, and the legal block.
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-[1280px] px-6 py-14 sm:px-10 lg:px-16 lg:py-16">
        <div className="grid gap-10 border-b border-ink-border pb-12 lg:grid-cols-[minmax(0,640px)_auto] lg:items-end lg:justify-between lg:gap-16">
          <div>
            <h2 className="font-garamond text-[32px] font-normal leading-[1.06] tracking-[-0.01em] text-ink-foreground sm:text-[42px] lg:text-[48px]">
              One open window onto{" "}
              <span className="font-instrument italic">regenerative impact</span>.
            </h2>
            <p className="mt-4 max-w-[520px] text-[15px] leading-[1.55] text-ink-foreground/72">
              Every record here is signed on the AT Protocol and lives on a
              community-owned PDS. The explorer just reads the commons; the data
              belongs to the people who created it.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink-foreground px-7 text-[14px] font-medium text-ink transition-colors hover:bg-ink-foreground/85"
            >
              Explore Bumicerts
              <span aria-hidden className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </Link>
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-2 text-[14px] text-ink-foreground/78 transition-colors hover:text-brand"
            >
              Open the Green Globe map
              <span aria-hidden className="text-ink-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-brand">
                →
              </span>
            </Link>
          </div>
        </div>

        <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-12">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <LogoMark className="h-7 w-7 text-brand" title="GainForest" />
              <span className="font-garamond text-[22px] font-semibold text-ink-foreground">
                GainForest
              </span>
              <span className="text-[13px] text-ink-foreground/52 lg:ml-2">
                © {year} GainForest. Data belongs to its communities.
              </span>
            </div>
            <p className="mt-4 max-w-[640px] text-[13px] leading-[1.55] text-ink-foreground/60">
              GainForest Foundation, a Swiss non-profit. The explorer is an
              open read layer over the GainForest data commons and is not an
              official record of donations; figures mirror the live indexer and
              may lag the chain.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-ink-foreground/78 lg:max-w-[420px] lg:justify-end lg:gap-x-7">
            <Link href={GLOBE_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-brand">
              Green Globe
            </Link>
            <Link href={`${BUMICERTS_URL}/explore`} target="_blank" rel="noreferrer" className="transition-colors hover:text-brand">
              Bumicerts
            </Link>
            <Link href={STATUS_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-brand">
              Status
            </Link>
            <Link href="https://github.com/GainForest" target="_blank" rel="noreferrer" className="transition-colors hover:text-brand">
              GitHub
            </Link>
            <Link href={GAINFOREST_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-brand">
              gainforest.earth
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
