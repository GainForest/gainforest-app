import Link from "next/link";
import Image from "next/image";
import { BumicertsCard } from "./BumicertsCard";
import { GlobeCard } from "./GlobeCard";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

export function Hero({ snapshot }: { snapshot: LiveBumicertsSnapshot }) {
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

          {/* Bumicerts card — anchored left, no overlap with the globe sphere */}
          <div className="absolute left-0 top-[40px] z-20">
            <BumicertsCard snapshot={snapshot} />
          </div>

          {/* Live globe — flush right, fully visible at initial position */}
          <div className="absolute right-[-40px] top-[10px] z-10">
            <GlobeCard diameter={380} />
          </div>
        </div>
      </div>
    </section>
  );
}
