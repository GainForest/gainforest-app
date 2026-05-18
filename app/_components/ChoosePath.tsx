import Image from "next/image";
import Link from "next/link";
import { GlobeCard } from "./GlobeCard";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

export function ChoosePath({ snapshot }: { snapshot: LiveBumicertsSnapshot }) {
  // Use real thumbnails when available — the strip should feel like the
  // alpha.fund explore page in miniature.
  const strip = snapshot.bumicerts
    .filter((b) => b.imageUrl)
    .slice(0, 3);

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1440px] px-12 pt-4 pb-5">
        <h2 className="text-center font-garamond text-[22px] font-normal text-foreground">
          Choose how you want to use GainForest
        </h2>

        <div className="mt-3 grid grid-cols-12 items-center gap-4">
          {/* Globe card */}
          <div className="col-span-12 lg:col-span-4 flex items-start gap-6">
            {/* Hand-drawn circular icon (PNG, already includes its own ring).
                Generated via codex image gen so it matches the herbarium-y
                botanical sprig used in the hero. */}
            <div className="relative h-[70px] w-[70px] shrink-0">
              <Image
                src="/decor/icon-globe.png"
                alt=""
                fill
                sizes="70px"
                className="object-contain"
              />
            </div>
            <div>
              <div className="font-garamond text-[22px] font-medium text-foreground">
                Open the Globe
              </div>
              <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-foreground/65">
                Discover projects and ecosystems across the world. Explore,
                learn, and get inspired.
              </p>
              <Link
                href={GLOBE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-[13px] font-medium text-primary"
              >
                Open the Globe <span>→</span>
              </Link>
            </div>
          </div>

          {/* center globe — the same live, draggable globe as the hero,
              just sized small so it sits between the two CTAs */}
          <div className="col-span-12 lg:col-span-2 flex items-center justify-center">
            <GlobeCard diameter={140} caption={false} />
          </div>

          {/* or */}
          <div className="col-span-12 lg:col-span-1 text-center text-foreground/45 font-garamond italic">
            or
          </div>

          {/* Bumicerts card */}
          <div className="col-span-12 lg:col-span-3 flex items-start gap-6">
            <div className="relative h-[70px] w-[70px] shrink-0">
              <Image
                src="/decor/icon-plant.png"
                alt=""
                fill
                sizes="70px"
                className="object-contain"
              />
            </div>
            <div>
              <div className="font-garamond text-[22px] font-medium text-foreground">
                Explore Bumicerts
              </div>
              <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-foreground/65">
                Browse projects, create and manage Bumicerts, and support
                verified community impact.
              </p>
              <Link
                href={`${BUMICERTS_URL}/explore`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 border-b border-primary/40 pb-1 text-[13px] font-medium text-primary"
              >
                Explore Bumicerts <span>→</span>
              </Link>
            </div>
          </div>

          {/* mini gallery: real explore-page strip */}
          <div className="col-span-12 lg:col-span-2">
            <div className="overflow-hidden rounded-[14px] border border-border bg-[#fbf8f0] p-2 shadow-sm">
              <div className="flex items-center gap-1.5 px-1 pb-1.5">
                <SearchGlyph />
                <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-foreground/45">
                  All projects
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(strip.length ? strip : PLACEHOLDER_STRIP).map((item) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Link
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#cfd9c4]"
                    title={item.title}
                  >
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SearchGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="text-foreground/45">
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

const PLACEHOLDER_STRIP = [
  { id: "p1", href: `${BUMICERTS_URL}/explore`, title: "Project", imageUrl: "/decor/proj-1.jpg" },
  { id: "p2", href: `${BUMICERTS_URL}/explore`, title: "Project", imageUrl: "/decor/proj-2.jpg" },
  { id: "p3", href: `${BUMICERTS_URL}/explore`, title: "Project", imageUrl: "/decor/proj-3.jpg" },
];
