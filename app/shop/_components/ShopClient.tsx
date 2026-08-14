"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Check, AudioLines, Thermometer, Bell, Leaf, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */

const REGIONS = [
  { id: "kenya", label: "Kenya" },
  { id: "brazil", label: "Brazil" },
  { id: "philippines", label: "Philippines" },
] as const;

const ADDONS = [
  { id: "waterproof", price: 9 },
  { id: "printed", price: 5 },
] as const;

const SPEC_ITEMS = [
  {
    id: "audio",
    question: "Audio",
    answer:
      "Ultrasonic capture to 192 kHz sample rate, 16-bit, written to microSD. Continuous, scheduled or trigger-based recording.",
  },
  {
    id: "sensors",
    question: "Sensors",
    answer:
      "Temperature, relative humidity, ambient light, barometric pressure and a three-axis accelerometer, logged alongside the audio.",
  },
  {
    id: "power",
    question: "Power",
    answer:
      "Three AA or AAA cells. Roughly 4–6 µA in sleep, which puts a typical duty cycle in months rather than nights.",
  },
  {
    id: "radio",
    question: "Radio and regional builds",
    answer:
      "LoRaWAN event alerts, with radio settings fixed per region — Kenya, Brazil and the Philippines at launch. Audio is never transmitted; it stays on the card.",
  },
  {
    id: "size",
    question: "Size and enclosure",
    answer:
      "57 × 47 mm board. Fits the sealed waterproof case or the printed case, whose files are published so you can make your own.",
  },
  {
    id: "open",
    question: "Open hardware",
    answer:
      "Schematics and board files are published once field testing is complete, so a workshop anywhere can build, repair or adapt one.",
  },
] as const;

const DEVICE_SPECS = [
  {
    title: "Ultrasonic microphone",
    desc: "Tuned for bats and insects, not speech.",
  },
  {
    title: "Five environmental sensors",
    desc: "Temperature, humidity, light, pressure, motion.",
  },
  {
    title: "microSD slot",
    desc: "Your recordings, on a card you hold.",
  },
  {
    title: "LoRaWAN radio",
    desc: "Regional settings for Kenya, Brazil, Philippines.",
  },
];

const COUNTRIES = [
  "Switzerland",
  "Germany",
  "United States",
  "Kenya",
  "Brazil",
  "Philippines",
  "Indonesia",
  "Tanzania",
];

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════════════════ */

export function ShopClient() {
  const t = useTranslations("shop");

  const [region, setRegion] = useState<string>("kenya");
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState(1);
  const [shipTo, setShipTo] = useState<string>("");
  const [showBar, setShowBar] = useState(false);

  const configureRef = useRef<HTMLElement>(null);
  const unitPrice = 20;

  const addonTotal = Array.from(addons).reduce((sum, id) => {
    const addon = ADDONS.find((a) => a.id === id);
    return sum + (addon?.price ?? 0);
  }, 0);
  const linePrice = unitPrice + addonTotal;
  const total = linePrice * units;

  const toggleAddon = (id: string) => {
    setAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToConfigure = () => {
    configureRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Show sticky bar after scrolling past hero
  useEffect(() => {
    const main = document.querySelector("main");
    const onScroll = () => {
      const scrollTop = main?.scrollTop ?? window.scrollY;
      setShowBar(scrollTop > 500);
    };
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const selectedRegion = REGIONS.find((r) => r.id === region);
  const barSummary =
    addons.size > 0
      ? `${selectedRegion?.label} + ${addons.size} add-on${addons.size > 1 ? "s" : ""}`
      : `${selectedRegion?.label} · board only`;

  return (
    <div className="relative bg-background font-sans">
      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 py-12 sm:px-6 md:py-16 lg:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 text-center">
          <div className="flex max-w-2xl flex-col items-center gap-5">
            <h1 className="font-instrument text-4xl font-normal italic leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Hear what{" "}
              <span className="relative text-primary">
                nature
                <span
                  className="absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-primary/40"
                  aria-hidden="true"
                />
              </span>{" "}
              is saying
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              A pocket-sized recorder that listens above the range of human
              hearing, logs the weather around it, and keeps going for months on
              three AA cells.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={scrollToConfigure}>
                Pre-order — ${unitPrice}
              </Button>
              <Button variant="outline" size="lg">
                Hear a sample
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Assembled and tested. Open hardware. Ships from Zurich.
            </p>
          </div>

          {/* Board hero image */}
          <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-muted">
            <Image
              src="/assets/media/images/bumimic/board-v0.3@2x.webp"
              alt="Bumimic board render"
              width={1155}
              height={953}
              className="h-full w-full object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — FOREST BACKGROUND
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-[280px] items-center overflow-hidden sm:min-h-[340px]">
        {/* Background image */}
        <Image
          src="/assets/media/images/devices/devices-hero-light@2x.webp"
          alt="Misty rainforest valley"
          fill
          className="object-cover"
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />

        {/* Text */}
        <div className="relative z-[2] mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
          <div className="flex max-w-md flex-col gap-4">
            <h2 className="font-instrument text-2xl font-normal italic leading-tight sm:text-3xl md:text-4xl">
              Most of a forest's voice is a frequency you'll never hear
            </h2>
            <p className="text-sm leading-relaxed text-foreground/80 sm:text-base">
              Bats, katydids and much of insect life communicate in ultrasound.
              Counting them has meant equipment a field team can only afford a
              handful of — so most sites go unlistened.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — FEATURES
      ═══════════════════════════════════════════════════════════════════ */}
      <section className="px-4 py-10 sm:px-6 md:py-14">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 md:gap-14">
          {/* Feature 1: Audio — image left */}
          <div className="flex flex-wrap items-center gap-6 md:gap-10">
            <div className="aspect-[4/3] min-w-[240px] flex-1 overflow-hidden rounded-xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <AudioLines className="size-5 text-primary" />
              <h3 className="font-instrument text-xl font-normal italic sm:text-2xl">
                Listens up to 192 kHz
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ultrasonic audio is written straight to a microSD card, on a
                schedule you set or whenever a trigger fires. The recordings
                never leave your hands.
              </p>
            </div>
          </div>

          {/* Feature 2: Sensors — image right */}
          <div className="flex flex-wrap items-center gap-6 md:gap-10">
            <div className="order-2 aspect-[4/3] min-w-[240px] flex-1 overflow-hidden rounded-xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <Thermometer className="size-5 text-primary" />
              <h3 className="font-instrument text-xl font-normal italic sm:text-2xl">
                Feels the weather too
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Temperature, humidity, light, pressure and movement are logged
                beside the audio, so a sighting arrives with the conditions that
                produced it.
              </p>
            </div>
          </div>

          {/* Feature 3: Alerts — image left */}
          <div className="flex flex-wrap items-center gap-6 md:gap-10">
            <div className="aspect-[4/3] min-w-[240px] flex-1 overflow-hidden rounded-xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <Bell className="size-5 text-primary" />
              <h3 className="font-instrument text-xl font-normal italic sm:text-2xl">
                Tells you when something happens
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Event alerts travel over LoRaWAN to whoever is watching the
                site. Only the alert leaves the forest — the audio stays on the
                card until you collect it.
              </p>
            </div>
          </div>

          {/* Feature 4: Battery — image right */}
          <div className="flex flex-wrap items-center gap-6 md:gap-10">
            <div className="order-2 aspect-[4/3] min-w-[240px] flex-1 overflow-hidden rounded-xl bg-muted">
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <Leaf className="size-5 text-primary" />
              <h3 className="font-instrument text-xl font-normal italic sm:text-2xl">
                Leave it out there
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                A few microamps at rest and three AA cells to draw from.
                Deployments are measured in months, and any shop that sells
                batteries can keep one running.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — DEVICE (board detail + quick specs)
      ═══════════════════════════════════════════════════════════════════ */}
      <section id="device" className="bg-muted px-4 py-10 sm:px-6 md:py-14">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8">
          {/* Header */}
          <div className="flex max-w-md flex-col gap-2 text-center">
            <h2 className="font-instrument text-3xl font-normal italic sm:text-4xl">
              57 × 47 mm
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Smaller than a credit card, with more sensors than the recorders
              it stands in for.
            </p>
          </div>

          {/* Board detail image */}
          <div className="aspect-[3/2] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card">
            <Image
              src="/assets/media/images/bumimic/board-v0.3@2x.webp"
              alt="Board detail"
              width={1155}
              height={953}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Quick specs */}
          <div className="grid w-full max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {DEVICE_SPECS.map((spec) => (
              <div key={spec.title} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{spec.title}</span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {spec.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — CONFIGURE (order form)
      ═══════════════════════════════════════════════════════════════════ */}
      <section
        ref={configureRef}
        id="configure"
        className="scroll-mt-20 px-4 py-10 sm:px-6 md:py-14"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {/* Header row with price */}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-instrument text-2xl font-normal italic sm:text-3xl">
              Configure yours
            </h2>
            <span className="font-mono text-xl sm:text-2xl">${total}</span>
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            Every choice for the order sits here — the regional radio build, a
            case if you want one, and where it ships.
          </p>

          {/* Order card */}
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            {/* Regional build */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                Regional build
              </span>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <Button
                    key={r.id}
                    size="sm"
                    variant={region === r.id ? "default" : "outline"}
                    onClick={() => setRegion(r.id)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs leading-snug text-muted-foreground">
                Radio settings are fixed at build time, so pick the country the
                device will live in.
              </span>
            </div>

            <div className="h-px bg-border" />

            {/* Add-ons */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">
                Add-ons — pick any, or none
              </span>
              <div className="flex flex-wrap gap-2">
                {ADDONS.map((a) => (
                  <Button
                    key={a.id}
                    size="sm"
                    variant={addons.has(a.id) ? "default" : "outline"}
                    onClick={() => toggleAddon(a.id)}
                  >
                    {a.id === "waterproof" ? "Waterproof case" : "3D-printed case"}{" "}
                    + ${a.price}
                  </Button>
                ))}
              </div>
              <span className="text-xs leading-snug text-muted-foreground">
                The waterproof case is sealed for wet-season deployment; the
                printed case is lighter and its files are open, so you can print
                your own. Accessory prices are provisional.
              </span>
            </div>

            <div className="h-px bg-border" />

            {/* Ship to + Units */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex min-w-[160px] max-w-[220px] flex-1 flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Ship to</span>
                <Select value={shipTo} onValueChange={setShipTo}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select a country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c.toLowerCase()}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Units</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => setUnits((u) => Math.max(1, u - 1))}
                    disabled={units <= 1}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-8 text-center font-mono text-sm">
                    {units}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => setUnits((u) => u + 1)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Total + Pre-order */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {units > 1 ? `${units} units` : "Total"}
                </span>
                <span className="font-mono text-lg">${total}</span>
              </div>
              <Button size="default">Pre-order</Button>
            </div>
          </div>

          {/* Bottom notes */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-1.5 text-foreground/80">
              <Check className="size-3.5 text-primary" />
              Assembled board and firmware
            </span>
            <span className="inline-flex items-center gap-1.5 text-foreground/80">
              <Check className="size-3.5 text-primary" />
              Open hardware files
            </span>
            <span className="text-muted-foreground">
              microSD card and batteries are not included.
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — SPECIFICATIONS
      ═══════════════════════════════════════════════════════════════════ */}
      <section id="specs" className="bg-muted px-4 py-10 sm:px-6 md:py-14">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <h2 className="font-instrument text-2xl font-normal italic sm:text-3xl">
            Specifications
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            The numbers, for the people who need them. Everything here is from
            the current prototype and may change before the first production
            run.
          </p>

          <Accordion type="single" collapsible className="w-full">
            {SPEC_ITEMS.map((item) => (
              <AccordionItem
                key={item.id}
                value={item.id}
                className="border-b border-border"
              >
                <AccordionTrigger className="py-3 text-left font-instrument text-base italic hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-3 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY BAR
      ═══════════════════════════════════════════════════════════════════ */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 transition-all duration-300",
          showBar ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
        )}
      >
        <div className="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-full border border-border bg-background/90 py-2 pl-4 pr-2 shadow-lg backdrop-blur-md">
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-sm">${total}</span>
            <span className="truncate text-[10px] text-muted-foreground">
              {barSummary}
            </span>
          </div>
          <Button size="sm" onClick={scrollToConfigure}>
            Pre-order
          </Button>
        </div>
      </div>

      {/* Bottom padding for sticky bar */}
      <div className="h-20" aria-hidden="true" />
    </div>
  );
}
