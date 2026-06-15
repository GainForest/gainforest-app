import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { DomTranslationFallback } from "@/components/i18n/DomTranslationFallback";
import "./globals.css";
import { ChromeGate } from "./_components/ChromeGate";
import { AccountDrawerProvider } from "./_components/AccountDrawer";
import { LinkPrefetcher } from "./_components/LinkPrefetcher";
import { RouteChangeIndicator } from "./_components/RouteChangeIndicator";
import { ModalProvider } from "@/components/ui/modal/context";
import { WagmiProvider } from "@/components/providers/WagmiProvider";
import { resolveSupportedLanguage } from "@/lib/i18n/languages";
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

const SITE_NAME = "GainForest";
const OG_IMAGE = "/og/bumicerts-og.png";
const OG_ALT =
  "GainForest — a warm cream editorial card about environmental impact, with observations, places, Bumicerts, and donations beside a vintage natural-history collage.";

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveSupportedLanguage(await getLocale());
  const t = await getTranslations("common.seo");
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    authors: [{ name: "GainForest", url: "https://www.gainforest.earth" }],
    creator: "GainForest",
    publisher: "GainForest",
    keywords: [
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
      locale,
      siteName: SITE_NAME,
      title,
      description,
      url: SITE_URL,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: OG_ALT }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
}

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${instrument.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DomTranslationFallback />
          <Suspense fallback={null}>
            <RouteChangeIndicator />
            <LinkPrefetcher />
          </Suspense>
          <NuqsAdapter>
            <WagmiProvider>
              <ModalProvider>
                <AccountDrawerProvider>
                  <ChromeGate>{children}</ChromeGate>
                </AccountDrawerProvider>
              </ModalProvider>
            </WagmiProvider>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
