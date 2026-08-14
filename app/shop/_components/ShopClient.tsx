"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import {
  AudioLinesIcon,
  BellIcon,
  ChevronDownIcon,
  LeafIcon,
  MinusIcon,
  PlusIcon,
  ThermometerIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const REGIONS = [
  { id: "kenya", label: "Kenya", price: 20 },
  { id: "brazil", label: "Brazil", price: 20 },
  { id: "philippines", label: "Philippines", price: 20 },
] as const;

const ADDONS = [
  { id: "waterproof", price: 9 },
  { id: "printed", price: 5 },
] as const;

const SPECS = [
  { id: "audio" },
  { id: "sensors" },
  { id: "power" },
  { id: "radio" },
  { id: "size" },
  { id: "open" },
] as const;

export function ShopClient() {
  const t = useTranslations("shop");

  const [region, setRegion] = useState<string>("kenya");
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState(1);
  const [shipTo, setShipTo] = useState<string>("");

  const orderRef = useRef<HTMLElement>(null);

  const basePrice = REGIONS.find((r) => r.id === region)?.price ?? 20;
  const addonTotal = Array.from(addons).reduce((sum, id) => {
    const addon = ADDONS.find((a) => a.id === id);
    return sum + (addon?.price ?? 0);
  }, 0);
  const unitPrice = basePrice + addonTotal;
  const total = unitPrice * units;

  const toggleAddon = (id: string) => {
    setAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToOrder = () => {
    orderRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const selectedRegion = REGIONS.find((r) => r.id === region);

  return (
    <div className="relative bg-background">
      {/* ═══════════════════════════════════════════════════════════════════
          HERO
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-3 py-12 sm:px-8 md:py-20 lg:py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center md:gap-10">
          {/* Title + lede + CTAs */}
          <div className="flex max-w-3xl flex-col items-center gap-6">
            <h1 className="font-instrument text-[clamp(2.5rem,7.4vw,4.75rem)] font-normal italic leading-[1.06] tracking-[-0.01em] text-foreground">
              {t("hero.title")}{" "}
              <span className="relative text-primary">
                <span className="relative">
                  {t("hero.accent")}
                  <span
                    className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-primary/40"
                    aria-hidden="true"
                  />
                </span>
              </span>{" "}
              {t("hero.titleEnd")}
            </h1>
            <p className="max-w-xl text-[clamp(1rem,1.6vw,1.25rem)] leading-relaxed text-foreground/80 [text-wrap:pretty]">
              {t("hero.lede")}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={scrollToOrder}
                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-medium text-primary-foreground shadow-md transition hover:bg-primary/90"
              >
                {t("hero.preOrder")} — ${basePrice}
              </button>
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-background px-6 text-base font-medium text-foreground transition hover:bg-muted"
              >
                {t("hero.hearSample")}
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground">{t("hero.tagline")}</p>
          </div>

          {/* Board render */}
          <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-3xl bg-muted">
            <Image
              src="/assets/media/images/bumimic/board-v0.3@2x.webp"
              alt={t("board.imageAlt")}
              width={1155}
              height={953}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FOREST BACKGROUND SECTION
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-[clamp(340px,42vw,480px)] items-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/assets/media/images/devices/devices-hero-light@2x.webp"
            alt=""
            fill
            className="object-cover"
          />
        </div>
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

        {/* Text */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-3 py-10 sm:px-8 md:py-16">
          <div className="flex max-w-lg flex-col gap-5">
            <h2 className="font-instrument text-[clamp(1.75rem,4.6vw,3rem)] font-normal italic leading-[1.08] tracking-[-0.01em] text-foreground [text-wrap:pretty]">
              {t("forest.title")}
            </h2>
            <p className="text-[clamp(0.9375rem,1.4vw,1.125rem)] leading-relaxed text-foreground/80 [text-wrap:pretty]">
              {t("forest.body")}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURES — alternating image/text
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-3 py-10 sm:px-8 md:py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:gap-16">
          {/* Feature 1: Audio — image left */}
          <div className="flex flex-wrap items-center gap-6 md:gap-12">
            <div className="aspect-[4/3] min-w-[280px] flex-1 overflow-hidden rounded-2xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-3.5">
              <AudioLinesIcon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-instrument text-[clamp(1.5rem,3vw,2.125rem)] font-normal italic leading-[1.12] text-foreground">
                {t("features.ultrasonic.title")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("features.ultrasonic.body")}
              </p>
            </div>
          </div>

          {/* Feature 2: Sensors — image right */}
          <div className="flex flex-wrap items-center gap-6 md:gap-12">
            <div className="aspect-[4/3] min-w-[280px] flex-1 overflow-hidden rounded-2xl bg-muted order-2">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-3.5">
              <ThermometerIcon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-instrument text-[clamp(1.5rem,3vw,2.125rem)] font-normal italic leading-[1.12] text-foreground">
                {t("features.sensors.title")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("features.sensors.body")}
              </p>
            </div>
          </div>

          {/* Feature 3: Alerts — image left */}
          <div className="flex flex-wrap items-center gap-6 md:gap-12">
            <div className="aspect-[4/3] min-w-[280px] flex-1 overflow-hidden rounded-2xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-3.5">
              <BellIcon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-instrument text-[clamp(1.5rem,3vw,2.125rem)] font-normal italic leading-[1.12] text-foreground">
                {t("features.alerts.title")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("features.alerts.body")}
              </p>
            </div>
          </div>

          {/* Feature 4: Battery — image right */}
          <div className="flex flex-wrap items-center gap-6 md:gap-12">
            <div className="aspect-[4/3] min-w-[280px] flex-1 overflow-hidden rounded-2xl bg-muted order-2">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-3.5">
              <LeafIcon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="font-instrument text-[clamp(1.5rem,3vw,2.125rem)] font-normal italic leading-[1.12] text-foreground">
                {t("features.battery.title")}
              </h3>
              <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("features.battery.body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SPECS GRID
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="border-y border-border bg-muted/40 px-3 py-10 sm:px-8 md:py-16">
        <div className="mx-auto max-w-6xl">
          {/* Board detail */}
          <figure className="mx-auto mb-10 max-w-3xl overflow-hidden rounded-2xl border border-dashed border-border bg-background">
            <Image
              src="/assets/media/images/bumimic/board-v0.3@2x.webp"
              alt={t("board.imageAlt")}
              width={1155}
              height={953}
              className="h-auto w-full"
            />
            <figcaption className="px-4 py-3 text-center text-sm text-muted-foreground">
              {t("specs.boardCaption")}
            </figcaption>
          </figure>

          {/* Quick specs */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <h4 className="font-medium text-foreground">{t(`quickSpecs.${i}.title`)}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{t(`quickSpecs.${i}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ORDER FORM
      ═══════════════════════════════════════════════════════════════════ */}
      <section
        ref={orderRef}
        id="order"
        className="scroll-mt-20 px-3 py-10 sm:px-8 md:py-16"
      >
        <div className="mx-auto max-w-2xl">
          <h2 className="font-instrument text-[clamp(1.75rem,4vw,2.5rem)] font-normal italic text-foreground">
            {t("order.title")}
          </h2>
          <p className="mt-2 text-muted-foreground [text-wrap:pretty]">{t("order.subtitle")}</p>

          <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
            {/* Regional build */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-muted-foreground">{t("order.region.label")}</span>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRegion(r.id)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      region === r.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {t("order.region.note")}
              </span>
            </div>

            <hr className="border-border" />

            {/* Add-ons */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-muted-foreground">{t("order.addons.label")}</span>
              <div className="flex flex-wrap gap-2">
                {ADDONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddon(a.id)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      addons.has(a.id)
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {t(`order.addons.${a.id}`)} + ${a.price}
                  </button>
                ))}
              </div>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {t("order.addons.note")}
              </span>
            </div>

            <hr className="border-border" />

            {/* Ship to + Units */}
            <div className="flex flex-wrap items-end gap-5">
              <div className="flex min-w-[160px] flex-1 max-w-[260px] flex-col gap-2">
                <span className="text-[13px] text-muted-foreground">{t("order.shipTo.label")}</span>
                <Select value={shipTo} onValueChange={setShipTo}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t("order.shipTo.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="switzerland">Switzerland</SelectItem>
                    <SelectItem value="germany">Germany</SelectItem>
                    <SelectItem value="usa">United States</SelectItem>
                    <SelectItem value="kenya">Kenya</SelectItem>
                    <SelectItem value="brazil">Brazil</SelectItem>
                    <SelectItem value="philippines">Philippines</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-muted-foreground">{t("order.units.label")}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUnits((u) => Math.max(1, u - 1))}
                    disabled={units <= 1}
                    className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-muted disabled:opacity-50"
                    aria-label={t("order.units.decrease")}
                  >
                    <MinusIcon className="size-4" />
                  </button>
                  <span className="w-8 text-center font-mono text-[15px] text-foreground">
                    {units}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnits((u) => u + 1)}
                    className="flex size-9 items-center justify-center rounded-full border border-border text-foreground transition hover:bg-muted"
                    aria-label={t("order.units.increase")}
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <hr className="border-border" />

            {/* Total + Pre-order */}
            <div className="flex flex-wrap items-center justify-end gap-4">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[13px] text-muted-foreground">{t("order.total")}</span>
                <span className="font-mono text-[22px] text-foreground">${total}</span>
              </div>
              <button
                type="button"
                className="h-11 rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {t("order.preOrder")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SPECIFICATIONS ACCORDION
      ═══════════════════════════════════════════════════════════════════ */}
      <section id="specs" className="scroll-mt-20 px-3 py-10 sm:px-8 md:py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-instrument text-[clamp(1.75rem,4vw,2.5rem)] font-normal italic text-foreground">
            {t("specifications.title")}
          </h2>
          <p className="mt-2 text-muted-foreground [text-wrap:pretty]">
            {t("specifications.subtitle")}
          </p>

          <Accordion type="single" collapsible defaultValue="audio" className="mt-6">
            {SPECS.map(({ id }, i) => (
              <AccordionItem key={id} value={id} className="border-b border-border">
                <AccordionTrigger className="group flex w-full items-center gap-4 py-4 text-left hover:no-underline">
                  <span className="text-lg font-light text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-instrument text-lg italic text-foreground">
                    {t(`specifications.items.${id}.title`)}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pl-10 text-sm leading-relaxed text-muted-foreground">
                  {t(`specifications.items.${id}.content`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY BOTTOM BAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-border bg-background/95 px-5 py-3 shadow-lg backdrop-blur-sm">
          <div className="text-sm">
            <span className="text-lg font-medium text-foreground">${unitPrice}</span>
            <span className="ml-1.5 text-muted-foreground">
              {selectedRegion?.label} · {addons.size > 0 ? `+${addons.size}` : t("stickyBar.boardOnly")}
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToOrder}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {t("stickyBar.preOrder")}
          </button>
        </div>
      </div>

      {/* Bottom padding for sticky bar */}
      <div className="h-24" aria-hidden="true" />
    </div>
  );
}
