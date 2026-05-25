import type { Metadata } from "next";
import { TopNav } from "../_components/TopNav";
import { Footer } from "../_components/Footer";
import { fetchLiveBumicerts } from "../_lib/bumicerts";
import { fetchLiveOccurrences } from "../_lib/occurrences-feed";
import { fetchOccurrenceCount } from "../_lib/occurrences";
import { ExplorerHero } from "./_components/ExplorerHero";
import { BumicertsMarquee } from "./_components/BumicertsMarquee";
import { SpecimenWall } from "./_components/SpecimenWall";

// Same canonical-URL guard layout.tsx, /about, and /research use; we
// never let the absolute OG / canonical URLs advertise a vercel.app
// preview domain even when the env var is set to one.
const CANONICAL_SITE_URL = "https://gainforest.app";
const RAW_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim();
const SITE_URL = (
  RAW_BASE_URL && !/\.vercel\.app(?::\d+)?\/?$/.test(RAW_BASE_URL)
    ? RAW_BASE_URL
    : CANONICAL_SITE_URL
).replace(/\/$/, "");

// The /explorer page does not have its own bespoke OG render yet; it
// reuses the landing OG so shares of /explorer at least land on a
// recognisable card rather than a 404 placeholder. Bump this to a
// dedicated card if the route's editorial framing diverges from the
// landing's "Open tools for regenerative intelligence" hero.
const OG_IMAGE_PATH = "/og/landing-2026-05-20.png";

// Server-rendered. Three live upstreams flow in:
//
//   • fetchLiveBumicerts(12)      → most-recent high-quality
//                                   Bumicerts (hyperlabel + indexer).
//   • fetchLiveOccurrences(...)   → Darwin Core occurrence records
//                                   (newest-first, with images).
//   • fetchOccurrenceCount()      → global Darwin Core record count
//                                   (Hyperindex `totalCount`); cheap
//                                   call separate from the feed.
//
// All three fetchers cache via Next's HTTP cache (`next: { revalidate }`)
// at 15 minutes, so this page benefits from the same refresh cycle the
// landing has ; we don't double-fetch when both pages render close
// together. Page-level `revalidate` mirrors the lower bound.
export const revalidate = 900;

const EXPLORER_TITLE = "Explorer";
const EXPLORER_DESCRIPTION =
  "Browse the GainForest data commons live; freshly minted Bumicerts and Darwin Core species observations streamed straight from partner PDS instances.";
const EXPLORER_OG_TITLE =
  "Explorer; the living GainForest data commons";

export const metadata: Metadata = {
  title: EXPLORER_TITLE,
  description: EXPLORER_DESCRIPTION,
  alternates: { canonical: "/explorer" },
  openGraph: {
    type: "website",
    title: EXPLORER_OG_TITLE,
    description: EXPLORER_DESCRIPTION,
    url: "/explorer",
    siteName: "GainForest",
    images: [
      {
        url: OG_IMAGE_PATH,
        secureUrl: `${SITE_URL}${OG_IMAGE_PATH}`,
        width: 1200,
        height: 630,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: EXPLORER_OG_TITLE,
    description: EXPLORER_DESCRIPTION,
    images: [OG_IMAGE_PATH],
    creator: "@gainforest",
    site: "@gainforest",
  },
};

export default async function ExplorerPage() {
  // Parallel-fetch all three upstreams. Each fetcher swallows its own
  // network errors and falls back to a known-recent value, so this is
  // always a positive snapshot.
  const [bumicerts, occurrences, occurrenceCount] = await Promise.all([
    fetchLiveBumicerts(12),
    // count: 48 ≈ 24 cards per row × 2 rows. The fetcher walks the
    // indexer live and resolves PDS blob URLs ; see
    // occurrences-feed.ts for why this stays fast in production
    // despite the per-request walk (ISR + per-page caching).
    fetchLiveOccurrences({ count: 48 }),
    fetchOccurrenceCount(),
  ]);

  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        <ExplorerHero
          bumicertsTotal={bumicerts.total}
          occurrencesTotal={occurrenceCount.total}
          communitiesCount={occurrences.communities}
        />
        <BumicertsMarquee snapshot={bumicerts} />
        <SpecimenWall snapshot={occurrences} />
      </main>
      <Footer />
    </div>
  );
}
