import Link from "next/link";
import { GlobeCard } from "./GlobeCard";
import { ChoosePathLabels } from "./ChoosePathLabels";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Choose how you want to use GainForest" — two large editorial path
// cards, side-by-side.
//
//   ┌──────────────────────┐   ┌──────────────────────┐
//   │ Open the Globe       │   │ Explore Bumicerts    │
//   │ ─ live spinning ─    │   │ ─ 3 real thumbs ─    │
//   │   body copy          │   │   body copy          │
//   │   Open the Globe →   │   │   Explore Bumicerts →│
//   └──────────────────────┘   └──────────────────────┘
//
// Why this replaced the earlier 5-column inline layout (text / globe
// / "or" / text / mini-card): the original layout read as 5 small
// disconnected pieces with a tiny globe icon and a floating "or"
// wedged in the middle. Audit feedback was "this section doesn't make
// sense" — the cards weren't visually tied to the surfaces they
// describe, and the "or" did no editorial work it couldn't do by
// implication. Two equally-weighted cards with the actual product
// surfaces embedded inside (a small live globe in the Globe card; a
// thumbnail strip in the Bumicerts card) make the choice immediate.
//
// What stayed:
//   - Hand-drawn icon PNGs (icon-globe.png / icon-plant.png) remain
//     out. AGENTS.md's "thin-stroke art doesn't match the rendered
//     apps" rule rejects re-introducing them.
//   - All colour values come from the design system.
//   - Real Bumicert thumbnails from the live snapshot — no fake data.
//
// Server-rendered (so we can `await fetchProjectPins()` inside
// <GlobeCard>); translatable strings come from <ChoosePathLabels />.
export function ChoosePath({ snapshot }: { snapshot: LiveBumicertsSnapshot }) {
  // Real Bumicert thumbnails for the mini "All projects" card. Never
  // inline mock arrays per AGENTS.md's "no fake data on the landing
  // page" hard rule.
  const strip = snapshot.bumicerts.filter((b) => b.imageUrl).slice(0, 3);

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1280px] px-6 pt-16 pb-16 sm:px-10 lg:px-16 lg:pt-20 lg:pb-20">
        <ChoosePathLabels slot="heading" />

        <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-14 lg:auto-rows-fr lg:grid-cols-2 lg:gap-8">
          {/* LEFT — Open the Globe path. Live spinning sphere at the
              bottom, eyebrow + heading + body at the top, arrow link
              flush with the sibling card. The whole card is a single
              anchor so any click takes the visitor to the live globe
              app. Uses `auto-rows-fr` on the grid so both cards reach
              the same height; the globe slot uses `flex-1` to fill
              the vertical room and keep the arrow pinned to the
              card foot. */}
          <Link
            href={GLOBE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the Globe"
            className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10"
          >
            <div className="min-w-0">
              <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                01 · Discover
              </span>
              <ChoosePathLabels slot="globe" />
            </div>
            {/* Live globe — the actual product surface, embedded.
                Bigger here (200 px) so the card matches the visual
                weight of the 3-thumbnail strip in the sibling card. */}
            <div className="flex flex-1 items-center justify-center">
              <div className="shrink-0">
                <GlobeCard diameter={200} caption={false} />
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary">
              <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
                Open the Globe
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>

          {/* RIGHT — Explore Bumicerts path. Mirrors the Globe card's
              chrome: eyebrow + heading + body + arrow + a small grid
              of three real project thumbnails labelled "All projects"
              (echoing the alpha.fund explore page's grid header). */}
          <Link
            href={`${BUMICERTS_URL}/explore`}
            target="_blank"
            rel="noreferrer"
            aria-label="Explore Bumicerts"
            className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10"
          >
            <div className="min-w-0">
              <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                02 · Support
              </span>
              <ChoosePathLabels slot="bumicerts" />
            </div>

            {/* Three real Bumicert thumbnails — the same `imageUrl`
                blobs the hero Bumicerts card uses, just at a smaller
                size. Each thumbnail is `aspect-[4/3]` so the row
                reads as a single horizontal band like alpha.fund's
                grid header strip. */}
            {strip.length > 0 && (
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-1.5">
                  <SearchGlyph />
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/45">
                    <ChoosePathLabels slot="allProjects" />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {strip.map((item) => (
                    <div
                      key={item.id}
                      className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#cfd9c4]"
                      title={item.title}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl!}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary">
              <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
                Explore Bumicerts
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// Small magnifying glass glyph used inside the mini card's header,
// echoing the search affordance on the real alpha.fund explore page.
function SearchGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-foreground/45"
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
