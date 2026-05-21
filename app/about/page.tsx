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

export const metadata: Metadata = {
  title: "About GainForest",
  description:
    "GainForest is a Swiss non-profit building open, community-first tools for nature stewards. Tech support for nature; from a 2017 UN hackathon to winning the XPRIZE Rainforest.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About GainForest",
    description:
      "Open tools for regenerative intelligence; meet the team behind GainForest, our mission, and the partners who back this work.",
    url: "/about",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About GainForest",
    description:
      "Open tools for regenerative intelligence; meet the team behind GainForest.",
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
        <AboutHero />
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
