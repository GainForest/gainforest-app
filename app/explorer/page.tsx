import type { Metadata } from "next";
import { TopNav } from "../_components/TopNav";
import { Footer } from "../_components/Footer";
import { fetchLiveBumicerts } from "../_lib/bumicerts";
import { fetchOccurrenceCount } from "../_lib/occurrences";
import { fetchProjectPins } from "../_lib/projects";
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

// Server-rendered shell. Three cheap upstreams flow in at build time:
//
//   • fetchLiveBumicerts(12)      → most-recent high-quality
//                                   Bumicerts (hyperlabel + indexer).
//                                   Capped at 12 records, fast.
//   • fetchOccurrenceCount()      → global Darwin Core record count
//                                   (Hyperindex `totalCount`); single-
//                                   field query, sub-second.
//   • fetchProjectPins()          → Green Globe live partner pin list.
//                                   `pins.length` drives the hero's
//                                   third KPI (frontline communities)
//                                   ; same source the landing's globe
//                                   and /about's stats band use.
//
// The Darwin Core record FEED (image-bearing edges that drive the
// specimen wall) is fetched client-side inside <SpecimenWall />
// because the indexer's newest pages are heavily skewed toward auto-
// uploaded sensor records with no `imageEvidence`. Finding ~200
// image-bearing records requires walking thousands of records ; that
// blows past Vercel's 60s static-generation timeout for the page.
// Hyperindex + plc.directory both serve `access-control-allow-origin: *`,
// so the browser can do the walk itself without needing an API proxy.
//
// Page-level `revalidate` matches the bumicerts cache cadence; once
// the page is built, subsequent requests serve the cached shell while
// the wall fetches its data on the client.
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
  // Parallel-fetch the three cheap upstreams. All three swallow their
  // own network errors and fall back to a known-recent value.
  const [bumicerts, occurrenceCount, pins] = await Promise.all([
    fetchLiveBumicerts(12),
    fetchOccurrenceCount(),
    fetchProjectPins(),
  ]);

  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        <ExplorerHero
          bumicertsTotal={bumicerts.total}
          occurrencesTotal={occurrenceCount.total}
          partnersCount={pins.length}
        />
        <BumicertsMarquee snapshot={bumicerts} />
        {/* Walks the indexer in the browser; renders a skeleton wall
            until the first batch of records comes back. The page
            itself never waits on that walk so the static build stays
            fast. */}
        <SpecimenWall occurrencesTotal={occurrenceCount.total} />
      </main>
      <Footer />
    </div>
  );
}
