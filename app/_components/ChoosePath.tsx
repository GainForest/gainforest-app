import Link from "next/link";
import { GlobeCard } from "./GlobeCard";
import { ChoosePathLabels } from "./ChoosePathLabels";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Pick how you want to use GainForest" — two-path section.
//
// Symmetric layout: each path (Globe / Bumicerts) gets the same column
// width and the same visual rhythm beneath the copy:
//
//   ┌──────────────────────────────┐  ┌──────────────────────────────┐
//   │ Title (large serif)          │  │ Title (large serif)          │
//   │ Body                         │  │ Body                         │
//   │ Open the Globe →             │  │ Explore Bumicerts →          │
//   │                              │  │                              │
//   │ [live globe sphere]          │  │ [3× live thumbnails]         │
//   └──────────────────────────────┘  └──────────────────────────────┘
//                       │ italic `or` divider │
//
// Both samples are real, live UI — the same green_globe spheres rendered
// in the hero card and the same Bumicerts thumbnails the alpha.fund
// explore page shows. No mockups, no fake data per the AGENTS.md hard
// rule "no fake data on the landing page".
//
// Server-rendered (so we can `await fetchProjectPins()` inside
// <GlobeCard>); translatable strings come from the small
// <ChoosePathLabels /> client island.
export function ChoosePath({ snapshot }: { snapshot: LiveBumicertsSnapshot }) {
  // Use real Bumicert thumbnails for the right-side sample — never
  // inline mock arrays per AGENTS.md.
  const strip = snapshot.bumicerts.filter((b) => b.imageUrl).slice(0, 3);

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-20 pb-20 sm:px-10 lg:px-16 lg:pt-24 lg:pb-24">
        <ChoosePathLabels slot="heading" />

        <div className="relative mt-14 grid grid-cols-1 gap-y-14 lg:grid-cols-[1fr_auto_1fr] lg:gap-x-12 xl:gap-x-20">
          {/* LEFT — Globe path */}
          <div className="flex flex-col items-start gap-7">
            <ChoosePathLabels slot="globe" href={GLOBE_URL} />
            {/* Live green_globe sphere — same component as the hero
                card, rendered smaller. Diameter is tuned so its
                visual weight matches the 3-thumbnail strip on the
                right (3 × 90 + 2 × 12 = 294 px wide; the 200 px sphere
                renders heavier per-pixel because it's filled, so the
                two visually balance). */}
            <div className="self-center lg:self-start lg:ml-1">
              <Link
                href={GLOBE_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Open the live globe"
                className="block"
              >
                <GlobeCard diameter={200} caption={false} />
              </Link>
            </div>
          </div>

          {/* CENTER — italic "or" divider. The grid column auto-sizes to
              this label so we don't waste horizontal space on it. */}
          <ChoosePathLabels slot="or" />

          {/* RIGHT — Bumicerts path */}
          <div className="flex flex-col items-start gap-7">
            <ChoosePathLabels
              slot="bumicerts"
              href={`${BUMICERTS_URL}/explore`}
            />
            {/* Live Bumicerts thumbnail strip — three most recent
                image-bearing Bumicerts from the indexer. Sized to
                visually pair with the 200 px globe on the left (see
                the comment over there for the math). We deliberately
                drop the trailing "All projects →" sub-link here —
                the path's primary "Explore Bumicerts →" already lives
                above, and an extra link on the right with no twin on
                the left would break the symmetry the team asked for. */}
            {strip.length > 0 && (
              <div className="self-center lg:self-start lg:ml-1 flex items-center gap-3">
                {strip.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="relative h-[90px] w-[90px] overflow-hidden rounded-[10px] border border-border-soft bg-[#cfd9c4] transition-transform hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(40,50,30,0.35)]"
                    title={item.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl!}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
