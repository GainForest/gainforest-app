"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  BinocularsIcon,
  Building2Icon,
  CameraIcon,
  CompassIcon,
  HandHeartIcon,
  KeyRoundIcon,
  LeafIcon,
  MapPinIcon,
  NetworkIcon,
  Share2Icon,
} from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ExplorerKpis } from "../_lib/kpis";
import { formatCompact, formatCompactUsd } from "../_lib/format";
import { StatsTileGrid, type StatsTileItem } from "./StatsTile";
import { ThemeToggle } from "./ThemeToggle";

type HomeLandingProps = {
  kpis?: ExplorerKpis | null;
};

const FEATURE_ITEMS = ["verified", "direct", "transparent"] as const;

const OPTION_CARDS = [
  {
    key: "funders",
    href: "/certs",
    image: "/assets/media/images/landing/supporter-river.jpg",
  },
  {
    key: "organizations",
    href: "/manage/certs",
    image: "/assets/media/images/landing/steward-waterfall.jpg",
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
        <FeaturesSection />
        <UserOptionCards />
        <WhatIsBumicert />
        <OpenNetworkSection />
      </main>
    </div>
  );
}

function LandingTopNavbar() {
  const t = useTranslations("landing");
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

        <div className="flex items-center gap-3">
          <ThemeToggle className="hidden sm:inline-flex" />
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <Link
              href="/certs"
              className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/15 transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t("nav.launchApp")}
            </Link>
          </motion.div>

        </div>
      </div>

    </motion.header>
  );
}

function LandingHero() {
  const t = useTranslations("landing.hero");
  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="absolute inset-y-0 right-0 w-full overflow-hidden">
        <motion.div
          initial={{ scale: 1.04, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0"
        >
          <Image
            src="/assets/media/images/landing/hero-rainforest@2x.webp"
            alt={t("imageAlt")}
            fill
            priority
            quality={95}
            sizes="100vw"
            className="object-cover object-center"
          />
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
              <span className="relative inline-block">{t("headingLine1")}</span>
              <br />
              <span className="relative inline-block">{t("headingLine2")}</span>
              <br />
              <span className="font-instrument text-primary italic dark:brightness-150">
                <span className="relative inline-block">
                  {t("headingEmphasis1")}
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
                </span>{" "}
                {t("headingEmphasis2")}
              </span>
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
                href="/certs"
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

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.68, ease: [0.25, 0.1, 0.25, 1] }}
              className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-4 text-sm text-foreground/75 md:justify-start"
            >
              <span className="inline-flex items-center gap-3">
                <LeafIcon className="size-6 stroke-[1.5]" />
                {t("proofPoints.communityLed")}
              </span>
              <span className="hidden h-8 w-px bg-foreground/20 sm:block" />
              <span className="inline-flex items-center gap-3">
                <CameraIcon className="size-6 stroke-[1.5]" />
                {t("proofPoints.photoVerified")}
              </span>
              <span className="hidden h-8 w-px bg-foreground/20 sm:block" />
              <span className="inline-flex items-center gap-3">
                <MapPinIcon className="size-6 stroke-[1.5]" />
                {t("proofPoints.geolocated")}
              </span>
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

  if (kpis.bumicerts != null) {
    stats.push({
      value: formatCompact(kpis.bumicerts),
      label: t("bumicertsShared"),
      href: "/certs",
      icon: <CompassIcon />,
      accent: true,
    });
  }
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
  if (kpis.totalRaised != null) {
    stats.push({
      value: formatCompactUsd(kpis.totalRaised),
      label: t("raisedForProjects"),
      href: "/leaderboard",
      icon: <HandHeartIcon />,
      accent: true,
    });
  }

  if (stats.length === 0) return null;

  return (
    <section className="px-6 pb-10 pt-0 sm:px-12 sm:pb-12 md:px-6 md:pb-12">
      <div className="mx-auto -mt-24 max-w-6xl rounded-[2rem] bg-background/65 p-2 shadow-sm shadow-primary/5 ring-1 ring-foreground/5 backdrop-blur-xl">
        <StatsTileGrid items={stats} columns={4} />
      </div>
    </section>
  );
}

function FeaturesSection() {
  const t = useTranslations("landing.features");
  return (
    <section className="px-6 pt-8 pb-10 sm:px-12 sm:pt-10 sm:pb-12 md:px-6 md:pt-8 md:pb-10">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
          className="mb-5 flex items-center gap-2"
        >
          <LeafIcon className="size-4 text-primary" />
          <span className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">{t("eyebrow")}</span>
        </motion.div>

        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-8">
          {FEATURE_ITEMS.map((feature, index) => (
            <motion.div
              key={feature}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.08 + 0.08, ease: [0.25, 0.1, 0.25, 1] }}
              className={cn(
                "sm:px-5",
                index === 0 && "sm:pl-0",
                index > 0 && "sm:border-l sm:border-border/80",
                index === FEATURE_ITEMS.length - 1 && "sm:pr-0",
              )}
            >
              <span className="font-garamond block text-5xl leading-none font-light tracking-tight text-primary/65 dark:text-primary/90">
                {t(`items.${feature}.number`)}.
              </span>
              <h3 className="font-instrument mt-4 text-lg leading-tight text-foreground">{t(`items.${feature}.title`)}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground dark:text-foreground/75">{t(`items.${feature}.description`)}</p>
            </motion.div>
          ))}
        </div>
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
            <motion.div
              key={card.key}
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
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatIsBumicert() {
  const t = useTranslations("landing.certificate");
  const [openItem, setOpenItem] = useState<FaqKey>("digitalCertificate");

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
            className="flex justify-center sm:justify-end"
          >
            <div className="relative w-full max-w-lg">
              <div className="absolute inset-0 scale-90 rounded-3xl bg-primary/10 blur-3xl" />
              <BumicertCardVisual
                className="relative shadow-xl shadow-foreground/10 [&_h3]:text-xl [&_h3]:leading-tight [&_p]:text-sm [&_p]:leading-relaxed"
                logoUrl="/assets/media/images/app-icon.png"
                coverImage="/assets/media/images/landing/certificate-river.jpg"
                title={t("previewTitle")}
                description={t("previewDescription")}
                organizationName="GainForest"
                objectives={[t("objectives.primary"), t("objectives.secondary")]}
              />
            </div>
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
                  {app.isSelf && (
                    <span className="absolute top-3 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary-foreground uppercase">
                      {t("youBadge")}
                    </span>
                  )}
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
  const objectivesToDisplay = [objectives[0], objectives.length > 1 ? `+${objectives.length - 1}` : null].filter(
    (objective): objective is string => typeof objective === "string",
  );

  return (
    <motion.div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:shadow-lg",
        className,
      )}
      initial="initial"
      whileHover="cardHover"
    >
      <div className="relative z-0 aspect-4/3 overflow-hidden">
        <Image
          src={coverImage}
          alt={title}
          fill
          sizes="(min-width: 640px) 500px, calc(100vw - 3rem)"
          className="scale-110 object-cover transition-all duration-300 group-hover:scale-100"
        />
      </div>
      <div className="relative z-1 -mt-6 flex flex-1 flex-col justify-between px-4 py-3">
        <div className="absolute -top-2 right-0 left-0 z-0 h-8 bg-linear-to-b from-transparent via-background/65 to-background" />
        <div>
          <h3 className="font-instrument relative z-1 line-clamp-1 text-2xl leading-snug text-foreground italic">{title}</h3>
          {description && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {objectivesToDisplay.length > 0 && (
          <div className="mt-4 flex w-full flex-wrap items-center gap-2">
            {objectivesToDisplay.map((objective) => (
              <span
                key={objective}
                className={cn(
                  "rounded-full bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground",
                  objective.startsWith("+") && "text-foreground",
                )}
              >
                {objective}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="absolute top-2 left-2 flex min-w-0 items-center gap-1 rounded-full bg-background/70 p-1 shadow-lg backdrop-blur-lg">
        <div className="relative h-6 w-6 shrink-0 scale-120 overflow-hidden rounded-full bg-white shadow-sm transition-all duration-300 group-hover:scale-100">
          <Image src={logoUrl} alt={organizationName} fill className="object-cover" />
        </div>
        <motion.span
          variants={{
            initial: { opacity: 0, maxWidth: 0, marginLeft: "-0.25rem", marginRight: "0rem", x: -2, filter: "blur(4px)" },
            cardHover: { opacity: 1, maxWidth: 200, marginLeft: "0rem", marginRight: "0.5rem", x: 0, filter: "blur(0px)" },
          }}
          className="overflow-hidden text-xs font-medium whitespace-nowrap text-foreground text-shadow-md"
        >
          {organizationName}
        </motion.span>
      </div>
    </motion.div>
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
