import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/AppShell";
import { Footer } from "./_components/Footer";
import { AccountDrawerProvider } from "./_components/AccountDrawer";
import { ModalProvider } from "@/components/ui/modal/context";
import { fetchStatus } from "./_lib/status";
import { fetchAuthSession } from "./_lib/auth-server";
import { SITE_URL } from "./_lib/urls";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-garamond-var",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif-var",
  display: "swap",
});

const SITE_NAME = "Bumicerts";
const SITE_TAGLINE = "plain-language GainForest impact explorer";
const SITE_DESCRIPTION =
  "Bumicerts is a plain-language explorer for GainForest impact: project stories, nature sightings, organizations, donations, field updates, and site health.";
const OG_IMAGE = "/og/bumicerts-og.png";
const OG_ALT =
  "Bumicerts — a warm cream editorial card about GainForest impact, with observations, places, Bumicerts, and donations beside a vintage natural-history collage.";

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
    "Bumicerts",
    "GainForest",
    "Bumicerts",
    "biodiversity",
    "explorer",
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
const THEME_INIT = `(function(){try{var t=localStorage.getItem('bumicerts-theme');var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

// The nav's live status pill is prefetched here so it is shared across every
// route (cached via `revalidate`, so it stays out of the per-request path).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [status, authSession] = await Promise.all([
    fetchStatus({ revalidate: 60 }),
    fetchAuthSession(),
  ]);
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${instrument.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <ModalProvider>
          <AccountDrawerProvider>
            <AppShell status={status} authSession={authSession}>
              {children}
              <Footer />
            </AppShell>
          </AccountDrawerProvider>
        </ModalProvider>
      </body>
    </html>
  );
}
