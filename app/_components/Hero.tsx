import Link from "next/link";
import Image from "next/image";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

export function Hero({
  snapshot: _snapshot,
}: {
  snapshot: LiveBumicertsSnapshot;
}) {
  void _snapshot;
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-4 px-16 pt-16 pb-10">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-6 pt-2">
          <h1 className="font-garamond text-[78px] font-normal leading-[1.02] tracking-[-0.015em] text-foreground">
            One home for
            <br />
            regenerative impact
          </h1>

          <p className="mt-7 max-w-[480px] text-[16px] leading-[1.55] text-foreground/70">
            Explore nature projects around the world, support community-led
            restoration, and create Bumicerts
            <br />
            that make ecological stewardship visible and verifiable.
          </p>

          <div className="mt-9 flex items-center gap-4">
            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[54px] items-center justify-center rounded-[10px] bg-primary px-9 text-[15px] font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark"
            >
              Explore Bumicerts
            </Link>
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[54px] items-center justify-center rounded-[10px] border border-primary/35 bg-transparent px-9 text-[15px] font-medium text-primary transition-colors hover:bg-primary/5"
            >
              Open the Globe
            </Link>
          </div>

          <p className="mt-6 max-w-[420px] text-[12px] leading-[1.55] text-foreground/45">
            Bumicerts are signed on AT Protocol — every record lives on a
            community-owned PDS and the live count to the right is pulled
            straight from the GainForest indexer.
          </p>
        </div>

        {/* RIGHT: composed layers
            Layout strategy — keep the live globe entirely uncovered on first
            paint so the user can grab it right away. The Bumicerts card sits
            to the *left* of the sphere (slightly overlapping the leaves
            bouquet) and the globe sits flush to the right edge of the column.
        */}
        <div className="relative col-span-12 lg:col-span-6 min-h-[480px]">
          {/* Tropical / rainforest botanical sprig — tall vertical specimen
              with a dynamic asymmetric pose (monstera, fern, palm, philodendron,
              heliconia). Sits in the narrow gap between the headline column
              and the Bumicerts card so its tip clears the card from above and
              its base shows below. Trimmed asset aspect ratio is ~0.37
              (507×1376); container matches that so object-contain fills it. */}
          <div className="pointer-events-none absolute -left-[18%] -top-4 h-[560px] w-[210px] z-0 opacity-85">
            <Image
              src="/decor/leaves.png"
              alt=""
              fill
              priority
              unoptimized
              className="object-contain object-center"
              sizes="210px"
            />
          </div>

          {/* Placeholder anchors for the two draggable cards. Both cards
              are rendered at the page level (`app/page.tsx`) so they can
              use document-coordinate `position: absolute` and scroll
              naturally with the rest of the page. The placeholders
              reserve their hero slots and give the client components a
              known starting position to read on mount. */}
          {/* The hero right column is only ~570px wide at typical viewports,
              so two ~400px windows cannot sit side-by-side. We embrace it as
              a stacked-desktop-windows look: the Globe card sits behind +
              offset to the top-right of the Bumicerts card, with its "Live"
              badge peeking out as an obvious affordance to grab and drag. */}
          {/* The two windows are roughly the same HEIGHT (~345 px), but
              the Globe card is narrower (280 px) than Bumicerts (400 px)
              because the globe is square — a wider window leaves cream
              wasted around it. The Globe anchor sits ~120 px above the
              Bumicerts anchor so the entire Globe header (logo +
              "Globe" + LIVE badge) and a sliver of the sphere peek out
              clearly above the Bumicerts card, telegraphing the two
              draggable windows. */}
          <div
            id="bumicerts-card-anchor"
            aria-hidden
            className="pointer-events-none absolute left-0 top-[140px] h-[360px] w-[400px]"
          />
          {/* right-[-35px] pushes the Globe card past the column's right
              edge so the sphere ends up sitting ~25% behind the Bumicerts
              card and ~75% peeking out on the right — the geometry
              assumes a 250 px sphere inside the 280 px card with Bumicerts
              ending at column-x ≈ 400. */}
          <div
            id="globe-card-anchor"
            aria-hidden
            className="pointer-events-none absolute right-[-35px] top-[20px] h-[360px] w-[280px]"
          />
        </div>
      </div>
    </section>
  );
}
