import Link from "next/link";
import { GlobeCard } from "./GlobeCard";
import { ChoosePathLabels } from "./ChoosePathLabels";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Choose how you want to use GainForest" — restored pre-redesign
// 5-column inline layout, updated to the current design system.
//
//   ┌──────────┐ ┌──────┐ ┌───┐ ┌──────────┐ ┌──────────────┐
//   │ Open the │ │ live │ │   │ │ Explore  │ │ Mini "All    │
//   │  Globe   │ │ globe│ │or │ │ Bumicerts│ │  projects"   │
//   │ body + ↳ │ │ 150px│ │   │ │ body + ↳ │ │ card • 3 thmb│
//   └──────────┘ └──────┘ └───┘ └──────────┘ └──────────────┘
//
// Why this layout (vs. the symmetric two-path version that briefly
// shipped during the May redesign): the team specifically called out
// that they "really liked the pre-redesign section, the components
// and green globe and bumicerts how they were displayed". The
// 5-column row is more editorial — title sits above, then the
// components sit *between* their explanatory copy so the reader
// sees real product surfaces (a spinning live globe, a real
// thumbnail strip) at the same eye-line as the words describing
// them.
//
// What changed vs. the original pre-redesign code:
//   - The hand-drawn icon PNGs (icon-globe.png / icon-plant.png)
//     are gone. AGENTS.md's "thin-stroke art doesn't match the
//     rendered apps" rule rejects re-introducing them.
//   - All colour values come from the design system (`--background`,
//     `--border-soft`, `--primary`, etc.); the only hard-coded hex
//     values left are the warm cream `#fbf8f0` and border `#e6dfd0`
//     on the mini Bumicerts card, which match the bigger
//     <BumicertsCard /> chrome verbatim so the two cards read as
//     the same product surface.
//   - The big symmetric title (`text-[44px]`) shrinks back to a
//     more editorial `text-[36px]` lg / `text-[28px]` mobile so
//     it doesn't overpower the live components below.
//   - The "or" goes back to an inline italic word in its own
//     column — no full-width divider rule that would split the row
//     in half.
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
      <div className="mx-auto w-full max-w-[1480px] px-6 pt-16 pb-16 sm:px-10 lg:px-16 lg:pt-20 lg:pb-20">
        <ChoosePathLabels slot="heading" />

        {/* 12-column grid for the 5 inline blocks (3 / 2 / 1 / 3 / 3).
            On mobile (< lg) every block stacks to col-span-12 and we
            switch to a vertical centred layout. The `items-center`
            keeps the globe / mini card vertically aligned with the
            text columns on desktop. */}
        <div className="mt-12 grid grid-cols-1 items-center gap-y-10 lg:mt-14 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-0 xl:gap-x-8">
          {/* 1. Globe text card */}
          <div className="flex justify-center lg:col-span-3 lg:justify-start">
            <ChoosePathLabels slot="globe" href={GLOBE_URL} />
          </div>

          {/* 2. Live globe sphere — same react-globe.gl component
              the hero card uses, just smaller. The 150 px diameter
              roughly visually balances the 3×90 px Bumicerts
              thumbnail strip on the right (the filled sphere reads
              heavier per pixel than the three rounded thumbnails,
              so the two end up at similar visual weight). */}
          <div className="flex justify-center lg:col-span-2">
            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the live globe"
              className="block transition-transform hover:-translate-y-0.5"
            >
              <GlobeCard diameter={150} caption={false} />
            </Link>
          </div>

          {/* 3. "or" — inline italic, NO divider rule (see comment
              in ChoosePathLabels for the rationale). */}
          <div className="flex items-center justify-center lg:col-span-1">
            <ChoosePathLabels slot="or" />
          </div>

          {/* 4. Bumicerts text card */}
          <div className="flex justify-center lg:col-span-3 lg:justify-start">
            <ChoosePathLabels
              slot="bumicerts"
              href={`${BUMICERTS_URL}/explore`}
            />
          </div>

          {/* 5. Mini "All projects" card — a tiny preview of the
              alpha.fund explore page. Chrome (`bg-[#fbf8f0]`,
              `border-[#e6dfd0]`) intentionally matches the bigger
              <BumicertsCard /> in the hero so the two cards feel
              like the same product surface, just at different
              zoom levels. */}
          <div className="flex justify-center lg:col-span-3">
            {strip.length > 0 && (
              <Link
                href={`${BUMICERTS_URL}/explore`}
                target="_blank"
                rel="noreferrer"
                className="group block w-full max-w-[300px] overflow-hidden rounded-[14px] border border-[#e6dfd0] bg-[#fbf8f0] p-2.5 shadow-[0_2px_8px_-4px_rgba(40,50,30,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(40,50,30,0.22)]"
                aria-label="Explore Bumicerts projects"
              >
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <SearchGlyph />
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/45">
                    <ChoosePathLabels slot="allProjects" />
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
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
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    </div>
                  ))}
                </div>
              </Link>
            )}
          </div>
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
