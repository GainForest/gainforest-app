import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TopNav } from "./_components/TopNav";
import { Footer } from "./_components/Footer";
import { AccountDrawerProvider } from "./_components/AccountDrawer";
import { fetchStatus } from "./_lib/status";
import { SITE_URL } from "./_lib/urls";

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

const SITE_NAME = "Bumiscan";
const SITE_TAGLINE = "the GainForest data commons explorer";
const SITE_DESCRIPTION =
  "Bumiscan is a read-only explorer for the GainForest data commons. Darwin Core occurrences, project sites, Bumicerts, and funding receipts from Hyperindex, plus Tainá field-device liveness and system status.";
const OG_IMAGE = "/og/bumiscan-og.png";
const OG_ALT =
  "Bumiscan — a warm cream editorial card. On the left, the sage GainForest leaf mark, the kicker ‘Explore the GainForest data commons’, the Bumiscan wordmark (with an italic sage ‘scan’), and an ‘observations · sites · bumicerts · donations’ pill. On the right, a vintage natural-history collage over an antique map: a blue tit and a robin, a fern, a golden chanterelle, a sunflower, a hand cradling soil with a seedling, an archival field-science photo, a brass magnifying glass, and floating faceted crystals.";

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
    "Bumiscan",
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
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    creator: "@gainforest",
    site: "@gainforest",
    images: [{ url: OG_IMAGE, alt: OG_ALT }],
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
  colorScheme: "light dark",
};

// Set the theme class before first paint so there's no light/dark flash. Reads
// the saved choice, else falls back to the OS preference.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('bumiscan-theme');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// The nav's live status pill is prefetched here so it is shared across every
// route (cached via `revalidate`, so it stays out of the per-request path).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = await fetchStatus({ revalidate: 60 });
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cormorant.variable} ${instrument.variable} ${mono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <div className="flex min-h-screen flex-col bg-background">
          <AccountDrawerProvider>
            <TopNav status={status} />
            <main className="flex-1">{children}</main>
            <Footer />
          </AccountDrawerProvider>
        </div>
      </body>
    </html>
  );
}
