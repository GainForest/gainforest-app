import Link from "next/link";
import { GlobeCard } from "./GlobeCard";
import { ChoosePathLabels } from "./ChoosePathLabels";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";
import { fetchProjectPins } from "../_lib/projects";

const GLOBE_URL = "https://gainforest.app";
const BUMICERTS_URL = "https://alpha.fund.gainforest.app";

// "Choose how you want to use GainForest" — two editorial cards
// side-by-side. Each card explains AND demonstrates one of the two
// surfaces GainForest hosts:
//
//   ┌──────────────────────┐   ┌──────────────────────┐
//   │ Open the Globe       │   │ What's a Bumicert?   │
//   │ ─ live spinning ─    │   │ — single sample      │
//   │   body copy          │   │   Bumicert detail —  │
//   │   Open the Globe →   │   │   Explore Bumicerts →│
//   └──────────────────────┘   └──────────────────────┘
//
// Why this layout (replaces an earlier 5-column row of disconnected
// pieces): each card visually demonstrates the surface it links to.
// The Globe card embeds a real spinning sphere of pins; the Bumicerts
// card embeds a real Bumicert preview drawn from the live indexer
// (title + thumbnail + description + status badge + region) so visitors
// SEE what a Bumicert is, not just "three random project photos".
//
// Audit feedback called the previous version's three-thumbnail strip
// confusing — "are bumicerts really just photos? it doesn't explain
// what this is". The single detailed preview answers that directly:
// a Bumicert is a structured, verifiable record with a real title, a
// human-written description, an issuing organisation, and a status —
// not just a photo.
//
// Server-rendered (so we can `await fetchProjectPins()` inside
// <GlobeCard>); translatable strings come from <ChoosePathLabels />.
export async function ChoosePath({
  snapshot,
}: {
  snapshot: LiveBumicertsSnapshot;
}) {
  // Pin count for the live-globe preview caption. Fetched server-side
  // so it stays inside the page's cached server render.
  const pins = await fetchProjectPins();

  // Featured trio for the right card. We render three Pokemon-card
  // style previews so visitors see Bumicerts as a *collection* of
  // verifiable records, not a single sample. Prefer entries with
  // a thumbnail AND a non-trivial description — those telegraph the
  // "structured record with story + photo" idea the section is making.
  const withImage = snapshot.bumicerts.filter(
    (b) => b.imageUrl && b.shortDescription && b.shortDescription.length > 20,
  );
  const fallback = snapshot.bumicerts.filter((b) => b.imageUrl);
  const featured = [...withImage, ...fallback].slice(0, 3);

  return (
    <section className="border-t border-border-soft">
      <div className="mx-auto w-full max-w-[1280px] px-6 pt-16 pb-16 sm:px-10 lg:px-16 lg:pt-20 lg:pb-20">
        <ChoosePathLabels slot="heading" />

        <div className="mt-12 grid grid-cols-1 gap-6 lg:mt-14 lg:auto-rows-fr lg:grid-cols-2 lg:gap-8">
          {/* LEFT — Green Globe path. Mirrors the structure of the
              right "What's a Bumicert?" card so the two paths feel
              like editorial siblings: short explainer copy above,
              richly-styled preview block in the middle, arrow link
              below. The previous version had a tiny 200px globe
              floating in empty space — visually it lost the
              balance against the detailed Bumicert preview on the
              right.

              This card is intentionally NOT wrapped in a single outer
              <Link>: the embedded globe is interactive (drag-to-rotate,
              wheel-to-zoom) and wrapping it in an anchor would (a)
              steal every click as a navigation, even mid-drag, and
              (b) produce invalid nested-interactive-element markup.
              Instead the heading and the CTA arrow at the bottom are
              independent links, and the card chrome only adds a
              hover-lift affordance. */}
          <div className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10">
            <div className="min-w-0">
              <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                01 · Explore the map
              </span>
              <h3 className="mt-3 font-garamond text-[24px] lg:text-[28px] font-normal leading-[1.15] text-foreground">
                <Link
                  href={GLOBE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-primary"
                >
                  What&apos;s Green Globe?
                </Link>
              </h3>
              <p className="mt-3 max-w-[420px] text-[14.5px] leading-[1.55] text-foreground/70">
                An interactive map of every community-led nature
                project. Each pin is a real organization on the
                ATProto network — explore stewards, ecosystems, and
                impact across continents.
              </p>
            </div>

            <div className="flex flex-1 items-center">
              <GlobePreview pinCount={pins.length} />
            </div>

            <Link
              href={GLOBE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Open Green Globe"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary self-start"
            >
              <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
                Open Green Globe
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>

          {/* RIGHT — What's a Bumicert? path.
              Embeds a fan of THREE real Bumicert cards (Pokemon-style
              framing — outer holo ring, title plate, art window,
              flavour text, bottom stat strip) so visitors read
              Bumicerts as a collection of verifiable records, not
              a single sample. Same un-wrapped structure as the left
              Green Globe card: not a single outer Link, because each
              fan card is its own link to its individual Bumicert
              page on alpha.fund. The heading + the bottom CTA arrow
              remain explicit nav targets. */}
          <div className="group flex h-full flex-col gap-6 rounded-[18px] border border-border-soft bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_18px_40px_-24px_rgba(40,50,30,0.22)] sm:gap-8 sm:p-8 lg:p-10">
            <div className="min-w-0">
              <span className="font-instrument italic text-[12px] uppercase tracking-[0.18em] text-foreground/45">
                02 · Meet the certificate
              </span>
              <h3 className="mt-3 font-garamond text-[24px] lg:text-[28px] font-normal leading-[1.15] text-foreground">
                <Link
                  href={`${BUMICERTS_URL}/explore`}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-primary"
                >
                  What&apos;s a Bumicert?
                </Link>
              </h3>
              <p className="mt-3 max-w-[420px] text-[14.5px] leading-[1.55] text-foreground/70">
                An open, verifiable record of nature impact — signed
                on ATProto, owned by the community that earned it.
                Each one carries a photo, a story, and a public
                provenance trail.
              </p>
            </div>

            {featured.length > 0 && (
              <div className="flex flex-1 items-center">
                <BumicertFan featured={featured} />
              </div>
            )}

            <Link
              href={`${BUMICERTS_URL}/explore`}
              target="_blank"
              rel="noreferrer"
              aria-label="Explore Bumicerts"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary self-start"
            >
              <span className="border-b border-primary/40 pb-0.5 transition-colors group-hover:border-primary">
                Explore Bumicerts
              </span>
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Live Green Globe preview block. Mirrors the structure of
// <BumicertPreview /> below — same card chrome, same proportions —
// so the two ChoosePath cards stay visually balanced. The previous
// version had a small floating globe with no surrounding chrome,
// which lost against the richly-detailed Bumicert preview on the
// right.
//
// Inside the chrome:
//
//   ┌──────────────────────────────────┐
//   │ ┌─ aspect 16/9 ──┐  ● LIVE       │
//   │ │   spinning      │              │
//   │ │   globe        │              │
//   │ └─────────────────┘              │
//   ├──────────────────────────────────┤
//   │ Green Globe                 Live │
//   │ Spin and pin community-led …     │
//   │ ──────────────────────────────── │
//   │ GAINFOREST.APP       50 LIVE PINS│
//   └──────────────────────────────────┘
//
// The "LIVE" badge in the corner of the visual matches the Bumicerts
// hero card and the Bumicert preview's "Verified" badge — same mint
// accent system across the page.
function GlobePreview({ pinCount }: { pinCount: number }) {
  return (
    <div className="w-full overflow-hidden rounded-[12px] border border-[#e6dfd0] bg-[#fbf8f0] shadow-[0_6px_20px_-12px_rgba(40,50,30,0.18)]">
      {/* Globe panel — aspect 16:9 to match the Bumicert preview's
          image panel. The sphere centers inside; the LIVE badge sits
          top-right, and a "drag · zoom" hint sits bottom-right so
          visitors discover the widget is interactive without
          having to click through to gainforest.app first.

          `cursor-grab` switches to `cursor-grabbing` while the user
          is rotating the globe (OrbitControls toggles `:active`
          pointer state on the canvas underneath). */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#fbf8f0]">
        <div className="absolute inset-0 grid place-items-center cursor-grab active:cursor-grabbing">
          {/* Diameter scales with the card width via the aspect-16/9
              container. 220px works well at the ~560px desktop card
              width and falls back gracefully on tablet.
              `interactive` enables drag + wheel zoom on this globe
              instance (the hero floating globe stays static). */}
          <GlobeCard diameter={220} caption={false} interactive />
        </div>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-brand-dark backdrop-blur-sm">
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          Live
        </span>
        {/* Affordance hint — small monochrome tag, doesn't compete with
            the LIVE badge. Pure drag-to-spin (no zoom); wheel-over the
            globe scrolls the page so the visitor never feels trapped
            on the canvas. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/55 backdrop-blur-sm opacity-90"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* horizontal double-headed arrow — drag-to-spin */}
            <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />
          </svg>
          drag to spin
        </span>
      </div>

      {/* Detail panel — mirrors BumicertPreview's */}
      <div className="px-3.5 py-3 sm:px-4">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="min-w-0 truncate font-garamond text-[16px] font-medium text-foreground sm:text-[17px]">
            Green Globe
          </h4>
          <span className="shrink-0 font-instrument italic text-[11px] tracking-[0.08em] text-foreground/45">
            live
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-foreground/65">
          Spin and pin community-led nature projects across the
          planet — every pin is an organization on ATProto.
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#ece5d4] pt-2 text-[10.5px] uppercase tracking-[0.1em] text-foreground/45">
          <span>gainforest.app</span>
          <span className="flex items-center gap-1">
            {pinCount}+ live pins
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M12 2C8 8 4 12 4 14a8 8 0 0016 0c0-2-4-6-8-12z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

// Three elegant Bumicert preview cards in a row. Editorial cream
// cards with a thin border, photo on top, title + description in
// the middle, ATProto metadata at the bottom — same look-and-feel
// as the rest of the page, just compact. No gradient rings, no
// rotation gimmicks — the team explicitly asked us to drop the
// "Pokemon card" framing that an earlier iteration tried.
//
//   ┌─────────┐ ┌─────────┐ ┌─────────┐
//   │  photo  │ │  photo  │ │  photo  │
//   ├─────────┤ ├─────────┤ ├─────────┤
//   │ title   │ │ title   │ │ title   │
//   │ desc    │ │ desc    │ │ desc    │
//   │ ⌗ ATP   │ │ ⌗ ATP   │ │ ⌗ ATP   │
//   └─────────┘ └─────────┘ └─────────┘
//
// On narrow viewports the row becomes a horizontal snap-scroll
// carousel so cards never collapse below their natural width.
function BumicertFan({
  featured,
}: {
  featured: ReadonlyArray<{
    id: string;
    title: string;
    imageUrl: string | null;
    shortDescription: string | null;
    href: string;
  }>;
}) {
  return (
    <ul
      role="list"
      className="-mx-3.5 flex w-[calc(100%+1.75rem)] snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-3.5 pb-2 sm:mx-0 sm:w-full sm:snap-none sm:gap-3.5 sm:overflow-x-visible sm:px-0"
    >
      {featured.map((b) => (
        <li
          key={b.id}
          className="snap-center min-w-[150px] sm:min-w-0 sm:flex-1"
        >
          <BumicertCard b={b} />
        </li>
      ))}
    </ul>
  );
}

// One Bumicert preview card. Same surface treatment as the
// editorial cards everywhere else on the page — `bg-background`
// (cream) inside, soft border, subtle hover lift, no gradient
// gimmicks. Title gets up to 2 lines, description up to 2 lines,
// and the ATProto/hypercerts metadata strip sits at the bottom in
// the small tracking-wide uppercase treatment alpha.fund uses on
// its own detail-page header.
function BumicertCard({
  b,
}: {
  b: {
    id: string;
    title: string;
    imageUrl: string | null;
    shortDescription: string | null;
    href: string;
  };
}) {
  return (
    <Link
      href={b.href}
      target="_blank"
      rel="noreferrer"
      className="group/card flex h-full flex-col overflow-hidden rounded-[10px] border border-[#e6dfd0] bg-background transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_10px_24px_-18px_rgba(40,50,30,0.30)]"
    >
      {/* Photo */}
      {b.imageUrl && (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#cfd9c4]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
          />
          {/* Verified badge — same brand-mint accent as the LIVE
              pill on the Green Globe preview. The only spot mint
              is a FILL on this card. */}
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-background/95 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-brand-dark backdrop-blur-sm">
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="text-brand"
            >
              <path
                d="M9 12l2 2 4-4M12 22a10 10 0 110-20 10 10 0 010 20z"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Verified
          </span>
        </div>
      )}

      {/* Body — title + description */}
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 pt-2 pb-2 sm:px-3 sm:pt-2.5">
        <h4
          className="font-garamond text-[13px] font-medium leading-[1.2] text-foreground overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
          }}
          title={b.title}
        >
          {b.title}
        </h4>
        {b.shortDescription && (
          <p
            className="text-[11px] leading-[1.4] text-foreground/60 overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
            }}
          >
            {b.shortDescription}
          </p>
        )}
        <div className="flex-1" />
        {/* Provenance footer — mirrors alpha.fund's detail-page header */}
        <div className="mt-1 border-t border-[#ece5d4] pt-1.5 text-[8.5px] uppercase tracking-[0.1em] text-foreground/45">
          <div className="truncate">org.hypercerts.claim</div>
          <div className="mt-0.5 flex items-center gap-1">
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="shrink-0"
            >
              <path
                d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span>ATProto signed</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
