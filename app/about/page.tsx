import type { Metadata } from "next";
import { TopNav } from "../_components/TopNav";
import { Footer } from "../_components/Footer";
import { fetchProjectPins } from "../_lib/projects";
import { fetchLiveBumicerts } from "../_lib/bumicerts";
import { AboutHero } from "./_components/AboutHero";
import { AboutStats } from "./_components/AboutStats";
import { AboutMission } from "./_components/AboutMission";
import { AboutStory } from "./_components/AboutStory";
import { AboutTeam } from "./_components/AboutTeam";
import { AboutRecognition } from "./_components/AboutRecognition";
import { AboutClosing } from "./_components/AboutClosing";

const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://gainforest.app"
).replace(/\/$/, "");

// Versioned per-route OG image. Rendered from `scripts/og-template-about.html`
// via `scripts/render-og.sh --slug about <date>` so it sits in the same
// visual language as the landing OG (Cormorant Garamond + Instrument Serif
// italic emphasis, cream palette, real GainForest photograph on the right).
//
// Bump this whenever the about hero copy or photograph changes; Twitter
// and Telegram cache OG by URL, so changing only the bytes behind the
// old path will not refresh already-shared previews.
const OG_IMAGE_PATH = "/og/about-2026-05-21.png";
const OG_IMAGE_ALT =
  "GainForest · About. The serif headline \"We are tech support for nature\" sits on a cream editorial background; on the right, a documentary photo of the GainForest team and Indigenous community standing together in front of a maloca in Greater Manaus.";

// Server-rendered /about page. Two upstreams flow in through the same
// pipelines the landing uses (matches AGENTS.md hard rule #1 — no
// inline mock data, all live counts come from Hyperindex):
//
//   • fetchProjectPins()      → Green Globe live community count
//                               (the "43 frontline communities" stat)
//   • fetchLiveBumicerts(12)  → high-quality Bumicerts total from
//                               hyperlabel + Hyperindex
//
// Both functions cache via Next's HTTP cache (`next: { revalidate }`),
// so this page benefits from the same 15-minute refresh cycle the
// landing has — we don't double-fetch when both pages render close
// together.
export const revalidate = 900;

const ABOUT_TITLE = "About GainForest";
const ABOUT_DESCRIPTION =
  "GainForest is a Swiss non-profit building open, community-first tools for nature stewards. Tech support for nature; from a 2017 UN hackathon to winning the XPRIZE Rainforest.";
const ABOUT_OG_TITLE = "About GainForest; tech support for nature";

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: "/about" },
  // Per-route OG / Twitter overrides. Without explicit `images`, Next
  // would inherit the landing OG from the root layout — the new
  // about-specific card matches the hero exactly (same headline,
  // same italic emphasis word, same documentary photo) so shares of
  // /about read as the About page itself rather than the landing.
  openGraph: {
    type: "website",
    title: ABOUT_OG_TITLE,
    description: ABOUT_DESCRIPTION,
    url: "/about",
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
    title: ABOUT_OG_TITLE,
    description: ABOUT_DESCRIPTION,
    images: [OG_IMAGE_PATH],
    creator: "@gainforest",
    site: "@gainforest",
  },
};

export default async function AboutPage() {
  // Match the landing's parallel-fetch pattern so the two upstreams
  // race rather than serialise; both already revalidate at the HTTP
  // cache layer, so this is cheap.
  const [pins, snapshot] = await Promise.all([
    fetchProjectPins(),
    fetchLiveBumicerts(12),
  ]);

  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        {/* Hero now renders the live globe (with rotating real-
            partner spotlight) in its right column, fed by the same
            `pins` array used by AboutStats and the landing's Partners
            section. One fetch, three downstream consumers. */}
        <AboutHero pins={pins} />
        <AboutStats
          communitiesCount={pins.length}
          bumicertsCount={snapshot.total}
        />
        <AboutMission />
        <AboutStory />
        <AboutTeam />
        <AboutRecognition />
        <AboutClosing />
      </main>
      <Footer />
    </div>
  );
}
