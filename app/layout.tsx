import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "./_components/LocaleProvider";

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
const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://gainforest.app"
).replace(/\/$/, "");

const SITE_NAME = "GainForest";
const SITE_TAGLINE = "One home for regenerative impact";
const SITE_DESCRIPTION =
  "Explore nature projects around the world, back community-led restoration, and mint Bumicerts — verifiable proof-of-impact records signed on ATProto.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
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
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/og/landing.png",
        secureUrl: `${SITE_URL}/og/landing.png`,
        width: 1200,
        height: 630,
        alt:
          "GainForest — One home for regenerative impact. A botanical illustration sits between the headline and a satellite view of Earth dotted with green project pins.",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/og/landing.png"],
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
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1a" },
  ],
  colorScheme: "light",
};

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
        "https://gainforest.app",
        "https://alpha.fund.gainforest.app",
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
      name: `${SITE_NAME} — ${SITE_TAGLINE}`,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      primaryImageOfPage: `${SITE_URL}/og/landing.png`,
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
    <html lang="en">
      <head>
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
            visitor's saved choice (or browser language) on hydration and
            re-renders every translated component with the right strings.
            Also exposes the locale to the FloatingCapybara so its chat
            replies match the active language. */}
        {/* Capybara is a Simocracy-style codex pet — removed from the
            GainForest landing per team feedback (the pixel-art tone
            didn't fit the editorial branding). The component file
            (`_components/FloatingCapybara.tsx`) is kept on disk in case
            it's wanted as an opt-in widget later. */}
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
