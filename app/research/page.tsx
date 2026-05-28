import type { Metadata } from "next";
import { TopNav } from "../_components/TopNav";
import { Footer } from "../_components/Footer";
import { fetchOccurrenceCount } from "../_lib/occurrences";
import { ResearchHero } from "./_components/ResearchHero";
import { ResearchPublications } from "./_components/ResearchPublications";
import { ResearchEcosystem } from "./_components/ResearchEcosystem";
import { ResearchModels } from "./_components/ResearchModels";
import { ResearchClosing } from "./_components/ResearchClosing";

// Same canonical-URL guard layout.tsx and /about use; we never let
// the absolute OG / canonical URLs advertise a vercel.app preview
// domain even when the env var is set to one.
const CANONICAL_SITE_URL = "https://gainforest.app";
const RAW_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim();
const SITE_URL = (
  RAW_BASE_URL && !/\.vercel\.app(?::\d+)?\/?$/.test(RAW_BASE_URL)
    ? RAW_BASE_URL
    : CANONICAL_SITE_URL
).replace(/\/$/, "");

// Versioned per-route OG image. Rendered from `scripts/og-template-research.html`
// via `scripts/render-og.sh --slug research <date>` so it sits in the
// same visual language as the landing + about OGs: Cormorant Garamond
// + Instrument Serif italic emphasis, cream palette, curved brush
// stroke under "Open". The right half is the remote-sensing pillar
// still (aerial canopy with tree-crown segmentation polygons), which
// visually anchors the three biggest research artefacts on the page
// (OAM-TCD, Geo-Bench, BiodivX) without needing a caption.
//
// Bump this whenever the research hero copy, palette, or photo
// changes; Twitter / Telegram / Bluesky cache OG by URL, so changing
// only the bytes behind the old path will not refresh already-shared
// previews.
const OG_IMAGE_PATH = "/og/research-2026-05-22.png";
const OG_IMAGE_ALT =
  "GainForest · Research. The serif headline \"Open models for biodiversity\" sits on a cream editorial background with a hand-drawn brush stroke under \"Open\"; on the right, an aerial photograph of forest canopy with tree-crown segmentation polygons drawn over individual trees.";

// Server-rendered. One live upstream feed today: the
// `app.gainforest.dwc.occurrence` totalCount from Hyperindex, used
// for the third hero KPI. The rest of the page is a static editorial
// index. A 15-minute revalidate matches the cadence the bumicerts
// fetcher uses on the landing so the two surfaces stay in sync if a
// visitor moves between them.
export const revalidate = 900;

const RESEARCH_TITLE = "Research at GainForest";
const RESEARCH_DESCRIPTION =
  "Peer-reviewed papers at NeurIPS, IEEE Field Robotics, and AAAI; open ATProto lexicons and a self-hostable Hypersphere stack for community-led conservation.";
const RESEARCH_OG_TITLE =
  "Research at GainForest · open ML and lexicons for nature";

export const metadata: Metadata = {
  title: RESEARCH_TITLE,
  description: RESEARCH_DESCRIPTION,
  alternates: { canonical: "/research" },
  openGraph: {
    type: "website",
    title: RESEARCH_OG_TITLE,
    description: RESEARCH_DESCRIPTION,
    url: "/research",
    siteName: "GainForest",
    images: [
      {
        url: OG_IMAGE_PATH,
        secureUrl: `${SITE_URL}${OG_IMAGE_PATH}`,
        width: 1200,
        height: 630,
        alt: OG_IMAGE_ALT,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: RESEARCH_OG_TITLE,
    description: RESEARCH_DESCRIPTION,
    images: [OG_IMAGE_PATH],
    creator: "@gainforest",
    site: "@gainforest",
  },
};

export default async function ResearchPage() {
  // Live Hyperindex count of `app.gainforest.dwc.occurrence`
  // records (Darwin Core biodiversity observations across partner
  // PDS instances). Fetcher swallows upstream errors and returns the
  // most recent known value as a fallback, so this is always a
  // positive integer.
  const occurrences = await fetchOccurrenceCount();

  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        <ResearchHero occurrencesCount={occurrences.total} />
        <ResearchPublications />
        <ResearchEcosystem />
        <ResearchModels />
        <ResearchClosing />
      </main>
      <Footer />
    </div>
  );
}
