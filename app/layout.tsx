import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "./_components/LocaleProvider";
import { FloatingTaina } from "./_components/FloatingTaina";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-garamond",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

// `NEXT_PUBLIC_BASE_URL` is used by the OAuth flow; reuse it here so all the
// canonical / OG URLs point at the same origin. Falls back to the production
// landing URL for prod builds where the env isn't set.
//
// IMPORTANT: when Vercel auto-injects `NEXT_PUBLIC_BASE_URL=https://gainforest-app.vercel.app`
// (or any other `*.vercel.app` preview domain) the OG / og:url / metadataBase
// would point at the preview origin, which makes Telegram + Twitter previews
// look broken (image fetches fine, but the canonical URL it advertises
// disagrees with the shared link, and chat apps occasionally refuse the
// preview). When we detect a vercel.app value we ignore it and fall back
// to the canonical production hostname instead.
const CANONICAL_SITE_URL = "https://gainforest.app";
const RAW_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL?.trim();
const SITE_URL = (
  RAW_BASE_URL && !/\.vercel\.app(?::\d+)?\/?$/.test(RAW_BASE_URL)
    ? RAW_BASE_URL
    : CANONICAL_SITE_URL
).replace(/\/$/, "");

const SITE_NAME = "GainForest";
// Version the social image path whenever the artwork changes. Telegram
// and several chat apps cache OG images aggressively by URL, so changing
// only the bytes behind `/og/landing.png` is not enough to refresh an
// already-shared preview.
//
// The 2026-05-20 OG was rendered with headless Chrome from
// `scripts/og-template.html` (cream half + real mangrove-fieldwork
// photo half) so the share card matches the post-redesign hero
// exactly — same curved brush stroke under "Open", same Cormorant
// Garamond + Instrument Serif headline, same cream/sage palette. The
// previous 2026-05-19 OG still used the pre-redesign straight-bar
// underline and decorative leaves PNG, which clashed with the live
// site after we stripped illustrated decoration.
const OG_IMAGE_PATH = "/og/landing-2026-05-20.png";
// Tagline mirrors the on-page hero (`hero.title.before` + `hero.title.italic`
// in app/_lib/i18n.ts). Keep these two in sync — the tagline drives the
// browser tab title, OG / Twitter card title, and JSON-LD WebPage name.
const SITE_TAGLINE = "Open tools for regenerative intelligence";
const SITE_TITLE = `${SITE_NAME}: ${SITE_TAGLINE}`;
const SITE_DESCRIPTION =
  "Explore nature projects around the world, back community-led restoration, and mint Bumicerts; verifiable proof-of-impact records signed on ATProto.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "GainForest", url: "https://www.gainforest.earth" }],
  creator: "GainForest",
  publisher: "GainForest",
  keywords: [
    "GainForest",
    "Bumicerts",
    "regenerative",
    "rainforest",
    "biodiversity",
    "ATProto",
    "AT Protocol",
    "ecological impact",
    "verified impact",
    "nature stewardship",
    "carbon credits",
    "impact certification",
    "decentralized identity",
    "PDS",
  ],
  category: "sustainability",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: OG_IMAGE_PATH,
        secureUrl: `${SITE_URL}${OG_IMAGE_PATH}`,
        width: 1200,
        height: 630,
        alt:
          "GainForest: Open tools for regenerative intelligence. The serif headline sits on a cream editorial background; on the right, three conservationists stand waist-deep in a mangrove channel doing fieldwork, one pointing into the canopy while the others record audio and gear in waterproof bags.",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_PATH],
    creator: "@gainforest",
    site: "@gainforest",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/icons/favicon.ico"],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/icons/site.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
  colorScheme: "light dark",
};

// Set the theme class before first paint so there's no light/dark flash.
// Reads the saved choice, else falls back to the OS preference. Ported from
// gainforest-explorer's THEME_INIT (storage key swapped to `gainforest-theme`).
const THEME_INIT = `(function(){try{var t=localStorage.getItem('gainforest-theme');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// JSON-LD structured data — helps Google, Bing, and Bluesky-style scrapers
// understand what this site is and which other surfaces it fronts. Inlined
// rather than fetched so it's available on the first byte.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
      sameAs: [
        "https://data.gainforest.app",
        "https://certs.gainforest.app",
        "https://www.gainforest.earth",
        "https://github.com/GainForest",
        "https://twitter.com/gainforest",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: SITE_TITLE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      primaryImageOfPage: `${SITE_URL}${OG_IMAGE_PATH}`,
      about: { "@id": `${SITE_URL}/#organization` },
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-FOUC theme bootstrap: add `.dark` to <html> before first
            paint based on the saved choice / OS preference. Must run
            before the body renders. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* JSON-LD structured data for richer search/SERP previews. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body
        className={`${inter.variable} ${cormorant.variable} ${instrument.variable} antialiased`}
      >
        {/* Client-side locale state. Defaults to English; reads the
            visitor's saved choice (or browser language) on hydration
            and re-renders every translated component with the right
            strings. Also exposes the locale to <FloatingTaina /> so
            her chat replies match the active language. */}
        {/* <FloatingTaina /> is the floating Simocracy-sim companion
            in the corner — same widget shape as the earlier
            FloatingCapybara, swapped to point at the Taina sim
            (see `app/_lib/taina-sim.ts` for the binding). The team's
            verdict on the previous version: "I liked the floating
            companion but didn't like that it was a capybara — use
            Taina instead". Taina's an actual GainForest-built AI
            assistant born from co-design with Indigenous communities
            around Manaus, so the pixel-art tone now matches the
            content tone of the page. */}
        <LocaleProvider>
          {children}
          <FloatingTaina />
        </LocaleProvider>
      </body>
    </html>
  );
}
