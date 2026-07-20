"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import {
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BinocularsIcon,
  Building2Icon,
  KeyRoundIcon,
  LeafIcon,
  NetworkIcon,
  PlayIcon,
  Share2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ExplorerKpis } from "../_lib/kpis";
import { fetchBumicerts, type BumicertRecord } from "../_lib/indexer";
import { localBumicertHref } from "../_lib/urls";
import { isPdsBlobUrl } from "../_lib/pds";
import { formatCompact } from "../_lib/format";
import { StatsTileGrid, type StatsTileItem } from "./StatsTile";
import { ThemeToggle } from "./ThemeToggle";
import { AuthModal } from "./AuthFlow";
import { GlobalSearch } from "./GlobalSearch";
import { LanguageSelector } from "@/components/i18n/LanguageSelector";
import { useModal } from "@/components/ui/modal/context";

type HomeLandingProps = {
  kpis?: ExplorerKpis | null;
};

const LANDING_NAV_LINKS = [
  { key: "projects", href: "/projects" },
  { key: "observations", href: "/observations" },
  { key: "organizations", href: "/organizations" },
  { key: "bioblitz", href: "/bioblitz" },
] as const;

const OPTION_CARDS = [
  {
    key: "funders",
    href: "/projects",
    image: "/assets/media/images/landing/supporter-river.jpg",
    // Optional ambient animal b-roll; falls back to `image` until the clip
    // exists at public/assets/media/video/card-funders.{webm,mp4}.
    video: "/assets/media/video/card-funders",
  },
  {
    key: "organizations",
    href: "/manage/organizations",
    image: "/assets/media/images/landing/steward-waterfall.jpg",
    video: "/assets/media/video/card-organizations",
  },
] as const;

const FAQ_ITEMS = ["digitalCertificate", "evidence", "communities", "story"] as const;

const NETWORK_APPS = [
  {
    key: "maEarth",
    name: "Ma Earth",
    logo: "/assets/media/images/landing/partners/ma-earth.png",
    isSelf: false,
  },
  {
    key: "gainforest",
    name: "GainForest",
    logo: null,
    isSelf: true,
  },
  {
    key: "hypercerts",
    name: "Hypercerts",
    logo: "/assets/media/images/landing/partners/hypercerts.png",
    isSelf: false,
  },
] as const;

const NETWORK_POINTS = [
  { key: "portable", icon: ArrowLeftRightIcon },
  { key: "owned", icon: KeyRoundIcon },
  { key: "shared", icon: Share2Icon },
] as const;

type FaqKey = (typeof FAQ_ITEMS)[number];

export function HomeLanding({ kpis = null }: HomeLandingProps) {
  return (
    <div className="min-h-screen bg-background">
      <LandingTopNavbar />
      <main className="w-full">
        <LandingHero />
        <HomeStats kpis={kpis} />
        <UserOptionCards />
        <ExplainerVideo />
        <WhatIsBumicert />
        <OpenNetworkSection />
      </main>
    </div>
  );
}

function LandingTopNavbar() {
  const t = useTranslations("landing");
  const { pushModal, show } = useModal();

  // Open the same sign-in flow used across the app. Signed-in visitors never
  // reach this navbar — the home route forwards them straight to the app.
  const openSignIn = () => {
    pushModal({ id: "auth", content: <AuthModal /> }, true);
    show();
  };

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="fixed top-0 right-0 left-0 z-50"
    >
      <div className="pointer-events-none absolute inset-0 h-24">
        <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/85 to-background/0" />
        <ProgressiveBlur position="top" height="100%" blurLevels={[0.5, 1, 2, 4, 8, 12]} className="z-0" />
      </div>

      <div className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
            <Image
              src="/assets/media/images/app-icon.png"
              alt={t("brand.alt")}
              width={28}
              height={28}
              className="drop-shadow-md"
            />
          </motion.div>
          <span className="font-garamond text-base font-medium tracking-tight text-foreground/85 transition-colors duration-200 group-hover:text-foreground">
            GainForest
          </span>
        </Link>

        <nav aria-label={t("nav.navigation")} className="hidden items-center gap-1 rounded-full border border-border/60 bg-background/60 p-1 shadow-sm shadow-foreground/5 backdrop-blur md:flex">
          {LANDING_NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t(`nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <GlobalSearch />
          <LanguageSelector />
          <ThemeToggle className="hidden sm:inline-flex" />
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <button
              type="button"
              onClick={openSignIn}
              className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t("nav.signIn")}
            </button>
          </motion.div>

        </div>
      </div>

    </motion.header>
  );
}

// React (and Next.js SSR) does not serialize the JSX `muted` prop into the
// server-rendered HTML, so mobile browsers parse the <video> as autoplay +
// unmuted and block autoplay at parse time — leaving only the poster. Desktop
// autoplay policies are lenient, which is why it "works on desktop but not on
// mobile". After hydration we re-assert muted on the DOM element and kick off
// playback ourselves; calling play() on a muted video needs no user gesture.
function useAmbientVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    const attempt = video.play();
    if (attempt) attempt.catch(() => {});
  }, []);
  return { videoRef: ref, videoReady, setVideoReady };
}

function LandingHero() {
  const t = useTranslations("landing.hero");
  // The ambient biodiversity clip fades in over the poster image once it can
  // actually play. If the clip is missing (not yet provided) or the browser
  // blocks autoplay, the poster image simply remains — identical to before.
  const { videoRef, videoReady, setVideoReady } = useAmbientVideo();
  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="absolute inset-y-0 right-0 w-full overflow-hidden">
        <motion.div
          initial={{ scale: 1.04, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
          {/* Base poster image: preserves the original LCP and is the graceful
              fallback whenever the ambient clip can't play. */}
          <Image
            src="/assets/media/images/landing/hero-rainforest@2x.webp"
            alt={t("imageAlt")}
            fill
            priority
            quality={95}
            sizes="100vw"
            className="object-cover object-center"
          />
          {/* Ambient biodiversity loop, iNaturalist-style: muted, autoplaying,
              looping, decorative. Drop the clip at
              public/assets/media/video/hero-biodiversity.{webm,mp4}; it fades in
              over the poster on first playback and stays hidden until then. */}
          <video
            ref={videoRef}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ease-out",
              videoReady ? "opacity-100" : "opacity-0",
            )}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            onPlaying={() => setVideoReady(true)}
          >
            <source src="/assets/media/video/hero-biodiversity.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/75 to-transparent md:bg-linear-to-r" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-linear-to-b from-transparent via-background/80 to-background" />
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-1 items-center px-6 pt-24 pb-32 md:px-12">
        <div className="mx-auto mt-12 grid w-full max-w-6xl items-center gap-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex max-w-[620px] flex-col items-center text-center md:items-start md:text-left"
          >
            <h1 className="font-garamond text-5xl leading-[1.08] font-medium tracking-[-0.02em] text-foreground md:text-7xl">
              <span className="font-instrument text-primary italic dark:brightness-150">
                <span className="relative inline-block">
                  {t("headingUnderlined")}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 178 16"
                    className="absolute -bottom-2 left-0 h-4 w-full text-primary"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M3 10.5C44 6.5 87 6 175 8.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2.25"
                    />
                  </svg>
                </span>
              </span>{" "}
              <span className="relative inline-block">{t("headingRest")}</span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.38, ease: [0.25, 0.1, 0.25, 1] }}
              className="mt-6 max-w-[500px] text-lg leading-relaxed text-foreground/80 md:mt-8 md:text-xl"
            >
{t("description")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.56, ease: [0.25, 0.1, 0.25, 1] }}
              className="mt-8"
            >
              <Link
                href="/projects"
                className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                {t("cta")}
                <motion.span
                  className="inline-flex"
                  animate={{ x: [0, 3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>
          <div aria-hidden="true" className="hidden md:block" />
        </div>
      </div>
    </section>
  );
}

function HomeStats({ kpis }: { kpis: ExplorerKpis | null }) {
  const t = useTranslations("landing.stats");
  if (!kpis) return null;

  const stats: StatsTileItem[] = [];

  if (kpis.sites != null) {
    stats.push({
      value: formatCompact(kpis.sites),
      label: t("organizationProfiles"),
      href: "/organizations",
      icon: <Building2Icon />,
    });
  }
  if (kpis.occurrences != null) {
    stats.push({
      value: formatCompact(kpis.occurrences),
      label: t("natureSightingsShared"),
      href: "/observations",
      icon: <BinocularsIcon />,
    });
  }

  if (stats.length === 0) return null;

  return (
    <section className="px-6 pb-10 pt-0 sm:px-12 sm:pb-12 md:px-6 md:pb-12">
      <div className="mx-auto -mt-28 max-w-6xl rounded-[2rem] bg-background/80 p-3 shadow-xl shadow-foreground/10 ring-1 ring-foreground/10 backdrop-blur-2xl sm:p-4">
        {/* "Live" eyebrow: these impact numbers stream from Hyperindex, so we
            flag them as live (iNaturalist-style social proof). */}
        <div className="mb-2 flex items-center gap-2 px-3 pt-1 sm:mb-3">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            {t("liveLabel")}
          </span>
        </div>
        <StatsTileGrid items={stats} columns={2} />
      </div>
    </section>
  );
}

function UserOptionCards() {
  const t = useTranslations("landing.paths");
  return (
    <section className="px-6 pt-8 pb-10 sm:px-12 sm:pt-10 sm:pb-12 md:px-6 md:pt-8 md:pb-12">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-6 text-center md:mb-8"
        >
          <div className="mb-4 flex items-center justify-center gap-3 text-primary/60">
            <span className="h-px w-8 bg-border" />
            <LeafIcon className="size-4" />
            <span className="h-px w-8 bg-border" />
          </div>
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {OPTION_CARDS.map((card, index) => (
            <OptionCard key={card.key} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OptionCard({
  card,
  index,
}: {
  card: (typeof OPTION_CARDS)[number];
  index: number;
}) {
  const t = useTranslations("landing.paths");
  // Ambient animal b-roll fades in over the photo once it can play; if the
  // clip is absent or autoplay is blocked, the photo simply stays — identical
  // to before. Decorative, so muted + aria-hidden.
  const { videoRef, videoReady, setVideoReady } = useAmbientVideo();
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 + 0.08, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Link href={card.href} className="group block">
        <div className="relative h-[320px] overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-foreground/5 transition-all duration-500 hover:border-primary/20 hover:shadow-xl sm:h-[360px]">
          <Image
            src={card.image}
            alt={t(`cards.${card.key}.alt`)}
            fill
            sizes="(min-width: 640px) 50vw, calc(100vw - 3rem)"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          {card.video ? (
            <video
              ref={videoRef}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-105",
                videoReady ? "opacity-100" : "opacity-0",
              )}
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              aria-hidden="true"
              onPlaying={() => setVideoReady(true)}
            >
              <source src={`${card.video}.mp4`} type="video/mp4" />
            </video>
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/88 to-card/0" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
            <span
              className={cn(
                "inline-flex rounded-full text-xs font-bold tracking-[0.12em] uppercase backdrop-blur",
                card.key === "funders"
                  ? "bg-primary px-4 py-1.5 text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/30"
                  : "bg-background/75 px-3 py-1 text-foreground/70 shadow-sm",
              )}
            >
              {t(`cards.${card.key}.label`)}
            </span>
            <h3 className="font-garamond mt-4 text-4xl leading-[1.05] font-light tracking-[-0.015em] text-foreground">
              {t(`cards.${card.key}.title`)}
              <br />
              <span className="font-instrument text-primary italic">{t(`cards.${card.key}.emphasis`)}</span>
            </h3>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground dark:text-foreground/75">{t(`cards.${card.key}.description`)}</p>
            <motion.div
              className="mt-5 flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary"
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              {t(`cards.${card.key}.cta`)}
              <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </motion.div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// GainForest's Bumicerts explainer on YouTube. We use a click-to-load facade:
// the poster + play button render instantly (no third-party JS, no cookies, no
// hit to LCP), and the privacy-hardened youtube-nocookie iframe is only mounted
// once the visitor actually chooses to watch.
const EXPLAINER_VIDEO_ID = "S1it4YS9tTc";

function ExplainerVideo() {
  const t = useTranslations("landing.explainer");
  const [playing, setPlaying] = useState(false);
  const videoTitle = t("videoTitle");
  return (
    <section className="px-6 pt-8 pb-12 sm:px-12 sm:pt-10 sm:pb-14 md:px-6 md:pt-8 md:pb-16">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-6 text-center md:mb-8"
        >
          <div className="mb-4 flex items-center justify-center gap-3 text-primary/60">
            <span className="h-px w-8 bg-border" />
            <PlayIcon className="size-4" />
            <span className="h-px w-8 bg-border" />
          </div>
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">
            {t("titlePrefix")} <span className="font-instrument text-primary italic">{t("titleEmphasis")}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative"
        >
          {/* soft glow behind the player, matching the certificate card */}
          <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-primary/10 blur-3xl" />
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-foreground/10">
            {playing ? (
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${EXPLAINER_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
                title={videoTitle}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={t("play")}
                className="group absolute inset-0 h-full w-full"
              >
                <Image
                  src={`https://i.ytimg.com/vi/${EXPLAINER_VIDEO_ID}/maxresdefault.jpg`}
                  alt={videoTitle}
                  fill
                  sizes="(min-width: 896px) 896px, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-foreground/20 transition-colors duration-300 group-hover:bg-foreground/10"
                />
                <span
                  aria-hidden
                  className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-primary shadow-lg ring-1 ring-border backdrop-blur transition-transform duration-300 group-hover:scale-110 md:size-20"
                >
                  <PlayIcon className="size-7 translate-x-0.5 fill-current md:size-9" />
                </span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function WhatIsBumicert() {
  const t = useTranslations("landing.certificate");
  const [openItem, setOpenItem] = useState<FaqKey>("digitalCertificate");

  // Real bumicerts for the rotating preview card (replaces the old static
  // "Mount Halimun" mock). Pull the newest records that have an image, then
  // cycle through them. If the indexer is unreachable we fall back to the
  // static i18n preview so the section never looks broken.
  const [certs, setCerts] = useState<BumicertRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Verified certs only: records created by an org carrying the "Ma Earth"
    // or "GainForest" featured badge (badge filters are OR'd). To scope to a
    // single Ma Earth round, swap badgeFilters to e.g. ["maearth-round-3"].
    fetchBumicerts(60, null, controller.signal, undefined, {
      sort: "newest",
      featuredBadgesOnly: true,
      badgeFilters: ["maearth", "gainforest"],
    })
      .then((page) => {
        const usable = page.records
          // next/image only renders http(s) covers; drop ipfs:// and other
          // schemes (rare) so the card never throws an "Invalid src" error.
          .filter(
            (r) =>
              r.imageUrl != null &&
              /^https?:\/\//.test(r.imageUrl) &&
              r.shortDescription &&
              r.title,
          )
          .slice(0, 8);
        setCerts(usable);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (certs.length < 2) return;
    const id = window.setInterval(
      () => setActiveIndex((i) => (i + 1) % certs.length),
      4200,
    );
    return () => window.clearInterval(id);
  }, [certs.length]);

  const active = certs.length > 0 ? certs[activeIndex % certs.length] : null;

  return (
    <section className="px-6 pt-10 pb-12 sm:px-12 sm:pt-12 sm:pb-14 md:px-6 md:pt-10 md:pb-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-8 sm:grid-cols-2 lg:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="mb-4 flex items-center gap-2 text-primary">
              <LeafIcon className="size-4" />
              <span className="text-xs font-bold tracking-[0.15em] uppercase">{t("eyebrow")}</span>
            </div>

            <h2 className="font-garamond mb-5 text-4xl leading-[1.04] font-light tracking-[-0.015em] text-foreground md:text-5xl">
              {t("titleLine1")}
              <br />
              <span className="font-instrument text-foreground italic">{t("titleLine2")}</span>
            </h2>

            <div>
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem
                  key={item}
                  item={item}
                  index={index}
                  isOpen={openItem === item}
                  onToggle={() => setOpenItem(item)}
                />
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col items-center sm:items-end"
          >
            <div className="relative">
              {/* soft glow behind the floating card */}
              <div aria-hidden className="absolute -inset-8 rounded-[2.5rem] bg-primary/10 blur-3xl" />
              <TiltCard>
                {/* Fixed trading-card frame so the cross-fade between certs
                    never shifts layout (cards are absolutely stacked inside). */}
                <div className="relative h-[452px] w-[300px]">
                  {active ? (
                    <AnimatePresence>
                      <motion.div
                        key={active.id}
                        className="absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                      >
                        <Link href={localBumicertHref(active.did, active.rkey)} className="block h-full w-full">
                          <BumicertCardVisual
                            className="h-full w-full"
                            logoUrl="/assets/media/images/app-icon.png"
                            coverImage={active.imageUrl ?? "/assets/media/images/landing/certificate-river.jpg"}
                            title={active.title}
                            description={active.shortDescription ?? undefined}
                            organizationName={active.creatorName ?? "GainForest"}
                            objectives={active.scopeTags.length > 0 ? active.scopeTags : [t("objectives.primary")]}
                          />
                        </Link>
                      </motion.div>
                    </AnimatePresence>
                  ) : (
                    <BumicertCardVisual
                      className="absolute inset-0 h-full w-full"
                      logoUrl="/assets/media/images/app-icon.png"
                      coverImage="/assets/media/images/landing/certificate-river.jpg"
                      title={t("previewTitle")}
                      description={t("previewDescription")}
                      organizationName="GainForest"
                      objectives={[t("objectives.primary"), t("objectives.secondary")]}
                    />
                  )}
                </div>
              </TiltCard>
            </div>

            {/* Dot rail to jump between / show progress through the live certs. */}
            {certs.length > 1 ? (
              <div className="mt-6 flex items-center justify-center gap-2">
                {certs.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={`Show ${c.title}`}
                    aria-current={i === activeIndex ? "true" : undefined}
                    onClick={() => setActiveIndex(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === activeIndex ? "w-6 bg-primary" : "w-1.5 bg-foreground/25 hover:bg-foreground/45",
                    )}
                  />
                ))}
              </div>
            ) : null}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function OpenNetworkSection() {
  const t = useTranslations("landing.openNetwork");
  return (
    <section className="px-6 pt-8 pb-12 sm:px-12 sm:pt-10 sm:pb-14 md:px-6 md:pt-8 md:pb-16">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-6 text-center md:mb-8"
        >
          <div className="mb-4 flex items-center justify-center gap-3 text-primary/60">
            <span className="h-px w-8 bg-border" />
            <NetworkIcon className="size-4" />
            <span className="h-px w-8 bg-border" />
          </div>
          <h2 className="font-garamond text-4xl font-light tracking-[-0.01em] text-foreground md:text-5xl">
            {t("titlePrefix")} <span className="font-instrument text-primary italic">{t("titleEmphasis")}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
{t("description")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
          className="mt-10 flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary shadow-sm">
            <NetworkIcon className="size-4" />
            {t("protocol.poweredBy")}
          </div>

          <div aria-hidden="true" className="hidden h-8 border-l border-dashed border-border sm:block" />
          <div className="my-5 h-6 border-l border-dashed border-border sm:hidden" />

          <div className="relative w-full">
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-0 hidden w-full -translate-y-1/2 border-t border-dashed border-border sm:block"
            />
            <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-3">
              {NETWORK_APPS.map((app, index) => (
                <motion.div
                  key={app.key}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: index * 0.08 + 0.12, ease: [0.25, 0.1, 0.25, 1] }}
                  className={cn(
                    "relative flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-8 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg",
                    app.isSelf
                      ? "border-primary/30 shadow-md shadow-primary/10"
                      : "border-border hover:border-primary/20",
                  )}
                >
                  <div className="flex h-9 items-center justify-center">
                    {app.isSelf ? (
                      <span className="flex items-center gap-2">
                        <Image
                          src="/assets/media/images/app-icon.png"
                          alt=""
                          width={30}
                          height={30}
                          className="drop-shadow-sm"
                        />
                        <span className="font-garamond text-2xl font-medium tracking-tight text-foreground">
                          {app.name}
                        </span>
                      </span>
                    ) : (
                      <div className="relative h-7 w-[180px]">
                        <Image
                          src={app.logo}
                          alt={`${app.name} logo`}
                          fill
                          sizes="180px"
                          className="object-contain opacity-90 dark:invert"
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground dark:text-foreground/75">
                    {t(`apps.${app.key}.blurb`)}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-muted-foreground">
            {NETWORK_POINTS.map((point) => (
              <span key={point.key} className="inline-flex items-center gap-2">
                <point.icon className="size-4 text-primary/70" />
                {t(`points.${point.key}`)}
              </span>
            ))}
          </div>

          <div className="mt-6 max-w-2xl rounded-2xl bg-muted px-4 py-3 text-center text-sm leading-6 text-muted-foreground">
            {t("storageNote")}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function AccordionItem({
  item,
  isOpen,
  onToggle,
  index,
}: {
  item: (typeof FAQ_ITEMS)[number];
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  const t = useTranslations("landing.certificate.faqItems");
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="group flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left"
      >
        <div className="flex items-center gap-4">
          <span className="font-garamond text-2xl font-light text-primary/70 dark:text-primary/95">0{index + 1}</span>
          <span className="font-instrument text-[17px] leading-snug text-foreground transition-colors duration-200 group-hover:text-primary">
            {t(`${item}.question`)}
          </span>
        </div>
        <span className="shrink-0 text-base text-muted-foreground transition-colors group-hover:text-foreground">
          {isOpen ? "−" : "+"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-lg pb-4 pl-11 text-[15px] leading-relaxed text-muted-foreground dark:text-foreground/75">{t(`${item}.answer`)}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 3D-tilt wrapper that makes the trading card follow the cursor with a moving
// holographic glare — the "Pokemon card" feel. Spring-smoothed motion values
// drive rotateX/rotateY and the glare, so pointer moves never re-render React.
function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(0, { stiffness: 180, damping: 16 });
  const rotateY = useSpring(0, { stiffness: 180, damping: 16 });
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useSpring(0, { stiffness: 120, damping: 20 });
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.55), rgba(255,255,255,0) 45%)`;

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const max = 11;
    rotateY.set((px - 0.5) * 2 * max);
    rotateX.set(-(py - 0.5) * 2 * max);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glareOpacity.set(1);
  };
  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
    glareOpacity.set(0);
  };

  return (
    <div className="[perspective:1100px]" onPointerMove={handleMove} onPointerLeave={reset}>
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        whileHover={{ scale: 1.03 }}
        transition={{ scale: { type: "spring", stiffness: 200, damping: 18 } }}
        className="relative will-change-transform"
      >
        {children}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.25rem] mix-blend-overlay"
          style={{ backgroundImage: glare, opacity: glareOpacity }}
        />
      </motion.div>
    </div>
  );
}

// A Bumicert rendered as a portrait trading card (Pokemon-card proportions):
// an org bar, a framed art window, then a title / description / objective box.
function BumicertCardVisual({
  coverImage,
  logoUrl,
  title,
  organizationName,
  objectives,
  description,
  className,
}: {
  coverImage: string;
  logoUrl: string;
  title: string;
  organizationName: string;
  objectives: string[];
  description?: string;
  className?: string;
}) {
  const pills = objectives.filter((o) => Boolean(o && o.trim())).slice(0, 3);
  const topPill = pills[0] ?? null;
  const infoPills = pills.slice(1);
  // Real cover images resolve to each owner's PDS getBlob URL (allowed by
  // next.config remotePatterns); any other absolute URL is served unoptimized
  // so the optimizer never 404s on an unknown host.
  const unoptimized = /^https?:\/\//.test(coverImage) && !isPdsBlobUrl(coverImage);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[1.25rem] border border-border/70 bg-card p-2.5 shadow-2xl shadow-foreground/20",
        className,
      )}
    >
      {/* foil frame tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[1.25rem] bg-gradient-to-br from-primary/15 via-transparent to-primary/10"
      />

      {/* top bar: org badge + objective "type" chip */}
      <div className="relative z-10 mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5">
            <Image src={logoUrl} alt={organizationName} fill className="object-cover" />
          </span>
          <span className="truncate text-[11px] font-semibold text-foreground/70">{organizationName}</span>
        </div>
        {topPill ? (
          <span className="max-w-[48%] shrink-0 truncate rounded-full bg-primary/12 px-2 py-0.5 text-[9px] font-bold tracking-[0.06em] text-primary uppercase">
            {topPill}
          </span>
        ) : null}
      </div>

      {/* art window */}
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <Image
          src={coverImage}
          alt={title}
          fill
          sizes="320px"
          unoptimized={unoptimized}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.07]"
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
      </div>

      {/* info box */}
      <div className="relative z-10 mt-2.5 rounded-xl bg-muted/50 px-3 py-2.5 backdrop-blur-sm">
        <h3 className="font-instrument line-clamp-2 text-[16px] leading-tight text-foreground italic">{title}</h3>
        {description ? (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{description}</p>
        ) : null}
        {infoPills.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {infoPills.map((pill) => (
              <span
                key={pill}
                className="max-w-full truncate rounded-full bg-background px-2 py-0.5 text-[9.5px] font-medium text-muted-foreground ring-1 ring-border"
              >
                {pill}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProgressiveBlur({
  className,
  height = "30%",
  position = "bottom",
  blurLevels = [1, 4, 10, 20],
}: {
  className?: string;
  height?: string;
  position?: "top" | "bottom";
  blurLevels?: number[];
}) {
  const direction = position === "top" ? "to top" : "to bottom";
  const step = 100 / (blurLevels.length + 1);

  return (
    <div
      className={cn("pointer-events-none absolute inset-x-0 z-10 grid", position === "top" ? "top-0" : "bottom-0", className)}
      style={{ height }}
    >
      {blurLevels.map((blur, index) => {
        const fadeStart = index * step;
        const fadeEnd = (index + 1) * step;
        const mask = `linear-gradient(${direction}, transparent ${fadeStart}%, #000 ${fadeEnd}%)`;

        return (
          <span
            key={blur}
            style={{
              gridArea: "1 / 1",
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
