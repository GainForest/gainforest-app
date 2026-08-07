"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ActivityIcon,
  AudioLinesIcon,
  BatteryIcon,
  BoxIcon,
  GaugeIcon,
  MailIcon,
  MemoryStickIcon,
  PackageIcon,
  RadioIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PictureHero } from "@/app/_components/PictureHero";
import { Separator } from "@/components/ui/separator";

/**
 * The hardware design lives in a private repository until the prototype has
 * been through field testing. Flip this to true once
 * github.com/GainForest/bumimic is public so the source link renders instead of
 * the "will be published" note — a public page must never ship a link that
 * resolves to a GitHub 404 for signed-out visitors.
 */
const BUMIMIC_REPO_PUBLIC = false;
const BUMIMIC_REPO_URL = "https://github.com/GainForest/bumimic";

const CONTACT_HREF = "mailto:team@gainforest.net";

const CAPABILITIES = [
  { key: "record", Icon: AudioLinesIcon },
  { key: "sense", Icon: GaugeIcon },
  { key: "radio", Icon: RadioIcon },
  { key: "power", Icon: BatteryIcon },
] as const;

const EXCLUDED = [
  { key: "microsd", Icon: MemoryStickIcon },
  { key: "antenna", Icon: RadioIcon },
  { key: "batteries", Icon: BatteryIcon },
  { key: "enclosure", Icon: BoxIcon },
  { key: "certification", Icon: ShieldCheckIcon },
  { key: "freight", Icon: PackageIcon },
  { key: "testing", Icon: ActivityIcon },
] as const;

const REGIONS = ["kenya", "brazil", "philippines"] as const;

export function ShopClient() {
  const t = useTranslations("shop");

  return (
    <section className="-mt-14 bg-background pb-20 md:pb-28">
      <PictureHero
        lightSrc="/assets/media/images/devices/devices-hero-light@2x.webp"
        darkSrc="/assets/media/images/devices/devices-hero-dark@2x.webp"
        imageAlt={t("hero.imageAlt")}
        title={t("hero.title")}
        accent={t("hero.accent")}
        lede={t("hero.lede")}
      />

      {/* Single width + gutter owner for the whole page body. */}
      <div className="relative z-10 mx-auto w-full max-w-6xl space-y-10 px-6 pt-6 md:space-y-14 lg:px-8">
        {/* Availability. A summary that must read as one unit, so it gets the
            page's one muted surface — no heading card around it. */}
        <div className="rounded-2xl bg-muted/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("prototype.title")}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("prototype.body")}</p>
            </div>
            <Link
              href={CONTACT_HREF}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <MailIcon className="size-4" aria-hidden="true" />
              {t("prototype.action")}
            </Link>
          </div>
        </div>

        {/* What it does + the board. Two peer columns, both open on the page:
            the capability list is divider-led, the render carries the only
            border because a media viewport is a functional boundary. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
          <section>
            <h2 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
              {t("capabilities.title")}
            </h2>
            <ul role="list" className="mt-5 divide-y divide-border">
              {CAPABILITIES.map(({ key, Icon }) => (
                <li key={key} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-foreground">
                      {t(`capabilities.items.${key}.title`)}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {t(`capabilities.items.${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:pt-1">
            <h2 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
              {t("board.title")}
            </h2>
            <figure className="mt-5">
              <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
                <Image
                  src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                  alt={t("board.imageAlt")}
                  width={1155}
                  height={953}
                  sizes="(min-width: 1024px) 26rem, (min-width: 640px) 90vw, 100vw"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
                {t("board.caption")}
              </figcaption>
            </figure>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("board.body")}</p>
            {BUMIMIC_REPO_PUBLIC ? (
              <Link
                href={BUMIMIC_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {t("board.repoLink")}
              </Link>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground/80">
                {t("board.repoPending")}
              </p>
            )}
          </section>
        </div>

        <Separator />

        {/* Cost. Open editorial region: two figures side by side, then the
            exclusions as a plain wrapping list rather than a grid of cards. */}
        <section>
          <h2 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("cost.title")}
          </h2>
          {/* The label leads in the DOM so each figure is announced as
              "Board and assembly, $13–18, …", while `order-*` keeps the amount
              visually first. A <dl> may only contain dt/dd inside its divs. */}
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {(["board", "unit"] as const).map((key) => (
              <div key={key} className="flex flex-col">
                <dt className="order-2 mt-2 text-sm font-medium text-foreground">
                  {t(`cost.${key}.label`)}
                </dt>
                <dd className="order-1 text-4xl font-light tracking-tight text-foreground sm:text-5xl">
                  {t(`cost.${key}.value`)}
                </dd>
                <dd className="order-3 mt-1 text-sm leading-6 text-muted-foreground">
                  {t(`cost.${key}.note`)}
                </dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-8 text-sm font-medium text-foreground">
            {t("cost.excludes.title")}
          </h3>
          <ul
            role="list"
            className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
          >
            {EXCLUDED.map(({ key, Icon }) => (
              <li key={key} className="flex items-center gap-2">
                <Icon className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                {t(`cost.excludes.items.${key}`)}
              </li>
            ))}
          </ul>

          <p className="mt-6 max-w-2xl text-sm leading-6 text-muted-foreground/80">
            {t("cost.note")}
          </p>
        </section>

        <Separator />

        {/* Regions. */}
        <section>
          <h2 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("regions.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("regions.body")}
          </p>
          <ul role="list" className="mt-4 flex flex-wrap gap-2">
            {REGIONS.map((key) => (
              <li
                key={key}
                className="rounded-full border border-border px-3 py-1 text-sm text-foreground"
              >
                {t(`regions.items.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        {/* Closing action. */}
        <section>
          <h2 className="font-instrument text-2xl font-light italic tracking-[-0.03em] text-foreground sm:text-3xl">
            {t("cta.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("cta.description")}
          </p>
          <Link
            href={CONTACT_HREF}
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MailIcon className="size-4" aria-hidden="true" />
            {t("cta.contact")}
          </Link>
        </section>
      </div>
    </section>
  );
}
