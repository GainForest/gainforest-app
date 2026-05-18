import Image from "next/image";
import Link from "next/link";

const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Nature thrives when we act together." closing CTA banner.
//
// The topographic contour decoration on the right is a raster image generated
// via gpt-image (`public/decor/topo-decor.png`) rather than inline SVG — the
// generated version has the organic hand-inked feel the reference mockup uses
// and the earlier hand-coded SVG ovals were too geometric.
export function NatureCTA() {
  return (
    <section className="px-16 pb-14">
      <div className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-6 overflow-hidden rounded-[18px] border border-border-soft bg-background/50 px-10 py-9 lg:flex-row lg:items-center lg:justify-between">
        {/* topographic contour decoration — generated raster, anchored on the
            right edge of the banner and bleeding off-page */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-[58%] opacity-30 lg:block"
        >
          <Image
            src="/decor/topo-decor.png"
            alt=""
            fill
            sizes="(min-width: 1024px) 800px, 0px"
            className="object-cover object-right"
          />
        </div>

        <div className="relative z-10 max-w-[640px]">
          <h2 className="font-garamond text-[36px] font-normal leading-[1.1] text-foreground">
            Nature thrives when we act together.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/65">
            Join a global community creating a fair future for nature and
            people.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-4">
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-[48px] items-center justify-center rounded-[10px] bg-primary px-7 text-[14px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
          >
            Explore projects
          </Link>
          <Link
            href={`${BUMICERTS_URL}/create`}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 text-[14px] font-medium text-primary"
          >
            Create a Bumicert
            <span
              aria-hidden
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
