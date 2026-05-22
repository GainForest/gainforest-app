import type { Metadata } from "next";
import { TopNav } from "../_components/TopNav";
import { Footer } from "../_components/Footer";
import { ResearchHero } from "./_components/ResearchHero";
import { ResearchPublications } from "./_components/ResearchPublications";
import { ResearchEcosystem } from "./_components/ResearchEcosystem";
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

// /research inherits the landing OG until we render a dedicated
// research card (same flow as /about: add a versioned PNG via
// scripts/render-og.sh when copy / layout settles). For now the
// metadata block points at the landing card so shares of /research
// still render a branded preview rather than a blank fallback.
const OG_IMAGE_PATH = "/og/landing-2026-05-19.png";
const OG_IMAGE_ALT =
  "GainForest research; open papers, datasets, and protocols for community-led conservation.";

// Server-rendered. The page is a static editorial index — no live
// upstream feeds (papers don't have a Hyperindex equivalent), so
// nothing to cache or revalidate beyond the standard route cache.
// Setting revalidate anyway keeps the cache behaviour consistent
// with /about and the landing.
export const revalidate = 86_400;

const RESEARCH_TITLE = "Research at GainForest";
const RESEARCH_DESCRIPTION =
  "Peer-reviewed papers at NeurIPS, IEEE Field Robotics, and AAAI; open ATProto lexicons and a self-hostable Hypersphere stack for community-led conservation.";
const RESEARCH_OG_TITLE =
  "Research at GainForest; open ML and lexicons for nature";

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

export default function ResearchPage() {
  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        <ResearchHero />
        <ResearchPublications />
        <ResearchEcosystem />
        <ResearchClosing />
      </main>
      <Footer />
    </div>
  );
}
