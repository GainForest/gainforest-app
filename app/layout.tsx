import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "./_components/TopNav";
import { Footer } from "./_components/Footer";
import { fetchStatus } from "./_lib/status";

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

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = "https://explorer.gainforest.app";
const SITE_NAME = "GainForest Explorer";
const SITE_TAGLINE = "Explore every record in the living forest";
const SITE_DESCRIPTION =
  "A block explorer for the GainForest data commons; Darwin Core species observations, project sites, and Bumicerts impact certificates signed on the AT Protocol, plus live donations and system status.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
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
    "Darwin Core",
    "biodiversity",
    "ATProto",
    "AT Protocol",
    "explorer",
    "Hyperindex",
    "impact certification",
    "donations",
  ],
  category: "sustainability",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
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
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/icons/site.webmanifest",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe4" },
    { media: "(prefers-color-scheme: dark)", color: "#141413" },
  ],
  colorScheme: "light",
};

// The nav's live status pill is prefetched here so it is shared across every
// route (cached via `revalidate`, so it stays out of the per-request path).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await fetchStatus({ revalidate: 60 });
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${cormorant.variable} ${instrument.variable} ${mono.variable} antialiased`}
      >
        <div className="flex min-h-screen flex-col bg-background">
          <TopNav status={status} />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
