"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AudioLinesIcon,
  BellIcon,
  ChevronDownIcon,
  LeafIcon,
  MinusIcon,
  PlusIcon,
  ThermometerIcon,
  RadioIcon,
  MicIcon,
  CpuIcon,
  BatteryIcon,
  RulerIcon,
  GitBranchIcon,
  HardDriveIcon,
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
  { id: "waterproof", label: "Waterproof case", price: 9 },
  { id: "printed", label: "3D-printed case", price: 5 },
] as const;

const SPECS = [
  {
    id: "audio",
    icon: MicIcon,
    title: "Audio",
    content:
      "Ultrasonic capture to 192 kHz sample rate, 16-bit, written to microSD. Continuous, scheduled or trigger-based recording.",
  },
  {
    id: "sensors",
    icon: ThermometerIcon,
    title: "Sensors",
    content:
      "Temperature, humidity, light, pressure and movement. Every detection arrives with the conditions that produced it.",
  },
  {
    id: "power",
    icon: BatteryIcon,
    title: "Power",
    content:
      "Three AA or AAA cells with USB-C for setup. A few microamps at rest means deployments measured in months.",
  },
  {
    id: "radio",
    icon: RadioIcon,
    title: "Radio and regional builds",
    content:
      "LoRaWAN radio tuned for each region: Kenya (EU868), Brazil (AU915), Philippines (AS923). Radio settings are fixed at build time.",
  },
  {
    id: "size",
    icon: RulerIcon,
    title: "Size and enclosure",
    content:
      "57 × 47 mm board, four-layer — slightly smaller than an AudioMoth in both directions. Optional waterproof or 3D-printed case.",
  },
  {
    id: "open",
    icon: GitBranchIcon,
    title: "Open hardware",
    content:
      "Schematic, board layout, manufacturing files and firmware are all developed in public. Build, repair and adapt it yourself.",
  },
] as const;

const FEATURES = [
  {
    id: "ultrasonic",
    icon: AudioLinesIcon,
    title: "Listens up to 192 kHz",
    body: "Ultrasonic audio is written straight to a microSD card, on a schedule you set or whenever a trigger fires. The recordings never leave your hands.",
  },
  {
    id: "sensors",
    icon: ThermometerIcon,
    title: "Reads the weather around it",
    body: "Temperature, humidity, light, pressure and movement are logged beside the audio, so a sighting arrives with the conditions that produced it.",
  },
  {
    id: "alerts",
    icon: BellIcon,
    title: "Tells you when something happens",
    body: "Event alerts travel over LoRaWAN to whoever is watching the site. Only the alert travels — the audio stays on the card until you collect it.",
  },
  {
    id: "battery",
    icon: LeafIcon,
    title: "Leave it out there",
    body: "A few microamps at rest and three AA cells to draw from. Deployments are measured in months, and any shop that sells batteries can keep one running.",
  },
] as const;

const QUICK_SPECS = [
  { icon: MicIcon, title: "Ultrasonic microphone", body: "Tuned for bats and insects, not speech." },
  { icon: CpuIcon, title: "Five sensors", body: "Temperature, humidity, light, pressure, motion." },
  { icon: RadioIcon, title: "LoRaWAN radio", body: "Regional settings for Kenya, Brazil, Philippines." },
  { icon: HardDriveIcon, title: "microSD storage", body: "Up to 512 GB of recordings on a single card." },
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const scrollToOrder = () => {
    orderRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const selectedRegion = REGIONS.find((r) => r.id === region);

  return (
    <div className="relative bg-background">
      {/* Hero */}
      <section className="relative flex min-h-[70vh] flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="max-w-3xl font-instrument text-5xl font-light italic leading-[1.1] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          {t("hero.title")}{" "}
          <span className="relative inline-block text-primary">
            {t("hero.accent")}
            <span
              className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-primary/40"
              aria-hidden="true"
            />
          </span>{" "}
          {t("hero.titleEnd")}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {t("hero.lede")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={scrollToOrder}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("hero.preOrder")} — ${basePrice}
          </button>
          <Link
            href="#sample"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 text-base font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("hero.hearSample")}
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {t("hero.tagline")}
        </p>
      </section>

      {/* Board render */}
      <section className="mx-auto max-w-4xl px-6 py-12">
        <figure className="overflow-hidden rounded-3xl border border-dashed border-border bg-muted/30">
          <Image
            src="/assets/media/images/bumimic/board-v0.3@2x.webp"
            alt={t("board.imageAlt")}
            width={1155}
            height={953}
            className="h-auto w-full"
            priority
          />
          <figcaption className="px-4 py-3 text-center text-sm text-muted-foreground">
            {t("board.caption")}
          </figcaption>
        </figure>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2">
          {FEATURES.map(({ id, icon: Icon, title, body }) => (
            <div key={id} className="flex gap-4">
              <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-instrument text-2xl font-light italic text-foreground">
                  {t(`features.${id}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`features.${id}.body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick specs grid */}
      <section className="border-y border-border bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <figure className="mx-auto mb-10 max-w-2xl overflow-hidden rounded-3xl border border-dashed border-border bg-background">
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
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_SPECS.map(({ icon: Icon, title, body }, i) => (
              <div key={i}>
                <h4 className="font-medium text-foreground">{t(`quickSpecs.${i}.title`)}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{t(`quickSpecs.${i}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Order section */}
      <section ref={orderRef} id="order" className="scroll-mt-20 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-instrument text-3xl font-light italic text-foreground sm:text-4xl">
            {t("order.title")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("order.subtitle")}</p>

          <div className="mt-8 space-y-6 rounded-3xl border border-border p-6">
            {/* Regional build */}
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("order.region.label")}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRegion(r.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      region === r.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("order.region.note")}</p>
            </div>

            <hr className="border-border" />

            {/* Add-ons */}
            <div>
              <h3 className="text-sm font-medium text-foreground">{t("order.addons.label")}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {ADDONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddon(a.id)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                      addons.has(a.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {t(`order.addons.${a.id}`)} + ${a.price}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t("order.addons.note")}</p>
            </div>

            <hr className="border-border" />

            {/* Ship to & units */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[160px] flex-1">
                <label htmlFor="ship-to" className="text-sm font-medium text-foreground">
                  {t("order.shipTo.label")}
                </label>
                <Select value={shipTo} onValueChange={setShipTo}>
                  <SelectTrigger id="ship-to" className="mt-2 w-full">
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
              <div>
                <label htmlFor="units" className="text-sm font-medium text-foreground">
                  {t("order.units.label")}
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUnits((u) => Math.max(1, u - 1))}
                    disabled={units <= 1}
                    className="flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    aria-label={t("order.units.decrease")}
                  >
                    <MinusIcon className="size-4" />
                  </button>
                  <span className="w-8 text-center text-lg font-medium text-foreground">
                    {units}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnits((u) => u + 1)}
                    className="flex size-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
                    aria-label={t("order.units.increase")}
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <hr className="border-border" />

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("order.total")}</span>
              <span className="text-3xl font-light text-foreground">${total}</span>
            </div>

            <button
              type="button"
              className="w-full rounded-full bg-primary py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("order.preOrder")}
            </button>
          </div>
        </div>
      </section>

      {/* Specifications accordion */}
      <section id="specs" className="scroll-mt-20 px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-instrument text-3xl font-light italic text-foreground sm:text-4xl">
            {t("specifications.title")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("specifications.subtitle")}</p>

          <Accordion type="single" collapsible defaultValue="audio" className="mt-8 rounded-3xl border border-border">
            {SPECS.map(({ id }, i) => (
              <AccordionItem key={id} value={id} className="border-b border-border last:border-b-0">
                <AccordionTrigger className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50 hover:no-underline [&>svg]:hidden">
                  <span className="text-xl font-light text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 font-instrument text-lg italic text-foreground">
                    {t(`specifications.items.${id}.title`)}
                  </span>
                  <ChevronDownIcon
                    className="size-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 pl-14 text-sm leading-relaxed text-muted-foreground">
                  {t(`specifications.items.${id}.content`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Sticky bottom bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-border bg-background/95 px-5 py-3 shadow-lg backdrop-blur-sm">
          <div className="text-sm">
            <span className="text-lg font-medium text-foreground">${unitPrice}</span>
            <span className="ml-1 text-muted-foreground">
              {selectedRegion?.label} · {addons.size > 0 ? `+${addons.size} add-on${addons.size > 1 ? "s" : ""}` : t("stickyBar.boardOnly")}
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToOrder}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
