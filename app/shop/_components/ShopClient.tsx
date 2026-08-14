"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
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
   ICONS (inline SVG masks matching reference)
═══════════════════════════════════════════════════════════════════════════ */

function AudioWaveIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 bg-primary", className)}
      style={{
        maskImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M2 10v3"%3E%3C/path%3E%3Cpath d="M6 6v11"%3E%3C/path%3E%3Cpath d="M10 3v18"%3E%3C/path%3E%3Cpath d="M14 8v7"%3E%3C/path%3E%3Cpath d="M18 5v13"%3E%3C/path%3E%3Cpath d="M22 10v3"%3E%3C/path%3E%3C/svg%3E')`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}

function ThermometerIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 bg-primary", className)}
      style={{
        maskImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M6 18h8"%3E%3C/path%3E%3Cpath d="M3 22h18"%3E%3C/path%3E%3Cpath d="M14 22a7 7 0 1 0 0-14h-1"%3E%3C/path%3E%3Cpath d="M9 14h2"%3E%3C/path%3E%3Cpath d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"%3E%3C/path%3E%3Cpath d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"%3E%3C/path%3E%3C/svg%3E')`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 bg-primary", className)}
      style={{
        maskImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M10.268 21a2 2 0 0 0 3.464 0"%3E%3C/path%3E%3Cpath d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"%3E%3C/path%3E%3C/svg%3E')`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}

function LeafIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 bg-primary", className)}
      style={{
        maskImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"%3E%3C/path%3E%3Cpath d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"%3E%3C/path%3E%3C/svg%3E')`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3.5 shrink-0 bg-primary", className)}
      style={{
        maskImage: `url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpath d="M20 6 9 17l-5-5"%3E%3C/path%3E%3C/svg%3E')`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
      }}
    />
  );
}

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
    const onScroll = () => setShowBar(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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
      <section
        style={{
          padding: "clamp(48px,9vw,104px) clamp(12px,4vw,32px) clamp(40px,6vw,72px)",
        }}
      >
        <div
          className="mx-auto flex flex-col items-center text-center"
          style={{ maxWidth: "72rem", gap: "clamp(24px,4vw,40px)" }}
        >
          <div
            className="flex flex-col items-center"
            style={{ maxWidth: "44rem", gap: "24px" }}
          >
            <h1
              className="m-0 font-instrument italic font-normal tracking-[-0.01em]"
              style={{
                fontSize: "clamp(40px,7.4vw,76px)",
                lineHeight: 1.06,
              }}
            >
              Hear what{" "}
              <span className="relative text-primary">
                nature
                <span
                  className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full bg-primary/40"
                  aria-hidden="true"
                />
              </span>{" "}
              is saying
            </h1>
            <p
              className="m-0 [text-wrap:pretty]"
              style={{
                maxWidth: "34rem",
                fontSize: "clamp(16px,1.6vw,20px)",
                lineHeight: 1.625,
                color: "color-mix(in srgb,var(--foreground) 78%,transparent)",
              }}
            >
              A pocket-sized recorder that listens above the range of human
              hearing, logs the weather around it, and keeps going for months on
              three AA cells.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={scrollToConfigure}
                className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-medium text-primary-foreground shadow-md transition hover:bg-primary/90"
              >
                Pre-order — ${unitPrice}
              </button>
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-background px-6 text-base font-medium text-foreground transition hover:bg-muted"
              >
                Hear a sample
              </button>
            </div>
            <p className="m-0 text-[13px] text-muted-foreground">
              Assembled and tested. Open hardware. Ships from Zurich.
            </p>
          </div>

          {/* Board hero image */}
          <div
            className="w-full overflow-hidden rounded-3xl bg-muted"
            style={{ maxWidth: "60rem", aspectRatio: "16/9" }}
          >
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
      <section
        className="relative flex items-center overflow-hidden"
        style={{ minHeight: "clamp(340px,42vw,480px)" }}
      >
        {/* Background image */}
        <Image
          src="/assets/media/images/devices/devices-hero-light@2x.webp"
          alt="Misty rainforest valley"
          fill
          className="object-cover"
        />
        {/* Gradient overlays */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right,var(--background),color-mix(in srgb,var(--background) 78%,transparent),transparent)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: "120px",
            background: "linear-gradient(to bottom,var(--background),transparent)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: "160px",
            background: "linear-gradient(to top,var(--background),transparent)",
          }}
        />

        {/* Text */}
        <div
          className="relative z-[2] mx-auto w-full"
          style={{
            maxWidth: "72rem",
            padding: "clamp(40px,6vw,72px) clamp(12px,4vw,32px)",
          }}
        >
          <div className="flex flex-col gap-5" style={{ maxWidth: "32rem" }}>
            <h2
              className="m-0 font-instrument italic font-normal tracking-[-0.01em] [text-wrap:pretty]"
              style={{
                fontSize: "clamp(28px,4.6vw,48px)",
                lineHeight: 1.08,
              }}
            >
              Most of a forest's voice is a frequency you'll never hear
            </h2>
            <p
              className="m-0 [text-wrap:pretty]"
              style={{
                fontSize: "clamp(15px,1.4vw,18px)",
                lineHeight: 1.625,
                color: "color-mix(in srgb,var(--foreground) 80%,transparent)",
              }}
            >
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
      <section style={{ padding: "clamp(40px,6vw,72px) clamp(12px,4vw,32px)" }}>
        <div
          className="mx-auto flex flex-col"
          style={{ maxWidth: "72rem", gap: "clamp(32px,5vw,64px)" }}
        >
          {/* Feature 1: Audio — image left */}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: "clamp(24px,4vw,48px)" }}
          >
            <div
              className="flex-[1_1_300px] min-w-[280px] overflow-hidden rounded-2xl bg-muted"
              style={{ aspectRatio: "4/3" }}
            >
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-[1_1_300px] min-w-[280px] flex-col gap-3.5">
              <AudioWaveIcon />
              <h3
                className="m-0 font-instrument italic font-normal"
                style={{
                  fontSize: "clamp(24px,3vw,34px)",
                  lineHeight: 1.12,
                }}
              >
                Listens up to 192 kHz
              </h3>
              <p className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                Ultrasonic audio is written straight to a microSD card, on a
                schedule you set or whenever a trigger fires. The recordings
                never leave your hands.
              </p>
            </div>
          </div>

          {/* Feature 2: Sensors — image right */}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: "clamp(24px,4vw,48px)" }}
          >
            <div
              className="order-2 flex-[1_1_300px] min-w-[280px] overflow-hidden rounded-2xl bg-muted"
              style={{ aspectRatio: "4/3" }}
            >
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-[1_1_300px] min-w-[280px] flex-col gap-3.5">
              <ThermometerIcon />
              <h3
                className="m-0 font-instrument italic font-normal"
                style={{
                  fontSize: "clamp(24px,3vw,34px)",
                  lineHeight: 1.12,
                }}
              >
                Feels the weather too
              </h3>
              <p className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                Temperature, humidity, light, pressure and movement are logged
                beside the audio, so a sighting arrives with the conditions that
                produced it.
              </p>
            </div>
          </div>

          {/* Feature 3: Alerts — image left */}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: "clamp(24px,4vw,48px)" }}
          >
            <div
              className="flex-[1_1_300px] min-w-[280px] overflow-hidden rounded-2xl bg-muted"
              style={{ aspectRatio: "4/3" }}
            >
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-[1_1_300px] min-w-[280px] flex-col gap-3.5">
              <BellIcon />
              <h3
                className="m-0 font-instrument italic font-normal"
                style={{
                  fontSize: "clamp(24px,3vw,34px)",
                  lineHeight: 1.12,
                }}
              >
                Tells you when something happens
              </h3>
              <p className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                Event alerts travel over LoRaWAN to whoever is watching the
                site. Only the alert leaves the forest — the audio stays on the
                card until you collect it.
              </p>
            </div>
          </div>

          {/* Feature 4: Battery — image right */}
          <div
            className="flex flex-wrap items-center"
            style={{ gap: "clamp(24px,4vw,48px)" }}
          >
            <div
              className="order-2 flex-[1_1_300px] min-w-[280px] overflow-hidden rounded-2xl bg-muted"
              style={{ aspectRatio: "4/3" }}
            >
              <Image
                src="/assets/media/images/bumimic/board-v0.3@2x.webp"
                alt=""
                width={600}
                height={450}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-[1_1_300px] min-w-[280px] flex-col gap-3.5">
              <LeafIcon />
              <h3
                className="m-0 font-instrument italic font-normal"
                style={{
                  fontSize: "clamp(24px,3vw,34px)",
                  lineHeight: 1.12,
                }}
              >
                Leave it out there
              </h3>
              <p className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
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
      <section
        id="device"
        className="bg-muted"
        style={{ padding: "clamp(48px,7vw,88px) clamp(12px,4vw,32px)" }}
      >
        <div
          className="mx-auto flex flex-col items-center"
          style={{ maxWidth: "72rem", gap: "clamp(24px,4vw,40px)" }}
        >
          {/* Header */}
          <div
            className="flex flex-col gap-3 text-center"
            style={{ maxWidth: "34rem" }}
          >
            <h2
              className="m-0 font-instrument italic font-normal tracking-[-0.01em]"
              style={{
                fontSize: "clamp(30px,5vw,52px)",
                lineHeight: 1.06,
              }}
            >
              57 × 47 mm
            </h2>
            <p
              className="m-0 [text-wrap:pretty]"
              style={{
                fontSize: "clamp(15px,1.4vw,17px)",
                lineHeight: 1.625,
                color: "var(--muted-foreground)",
              }}
            >
              Smaller than a credit card, with more sensors than the recorders
              it stands in for.
            </p>
          </div>

          {/* Board detail image */}
          <div
            className="w-full overflow-hidden rounded-3xl border border-border bg-card"
            style={{ maxWidth: "56rem", aspectRatio: "3/2" }}
          >
            <Image
              src="/assets/media/images/bumimic/board-v0.3@2x.webp"
              alt="Board detail"
              width={1155}
              height={953}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Quick specs */}
          <div
            className="flex w-full flex-wrap"
            style={{ maxWidth: "56rem", gap: "24px 40px" }}
          >
            {DEVICE_SPECS.map((spec) => (
              <div
                key={spec.title}
                className="flex flex-[1_1_180px] flex-col gap-1"
              >
                <span className="text-sm font-medium">{spec.title}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">
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
        className="scroll-mt-20"
        style={{ padding: "clamp(48px,7vw,88px) clamp(12px,4vw,32px)" }}
      >
        <div
          className="mx-auto flex flex-col gap-6"
          style={{ maxWidth: "56rem" }}
        >
          {/* Header row with price */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2
              className="m-0 font-instrument italic font-normal tracking-[-0.01em]"
              style={{
                fontSize: "clamp(30px,5vw,52px)",
                lineHeight: 1.04,
              }}
            >
              Configure yours
            </h2>
            <span
              className="font-mono"
              style={{ fontSize: "clamp(20px,2.6vw,28px)" }}
            >
              ${total}
            </span>
          </div>
          <p className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]" style={{ maxWidth: "38rem" }}>
            Every choice for the order sits here — the regional radio build, a
            case if you want one, and where it ships.
          </p>

          {/* Order card */}
          <div
            className="flex flex-col gap-5 rounded-2xl border border-border bg-card"
            style={{ padding: "clamp(16px,2.4vw,24px)" }}
          >
            {/* Regional build */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-muted-foreground">
                Regional build
              </span>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRegion(r.id)}
                    className={cn(
                      "h-9 rounded-md px-4 text-sm font-medium transition",
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
                Radio settings are fixed at build time, so pick the country the
                device will live in.
              </span>
            </div>

            <div className="h-px bg-border" />

            {/* Add-ons */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-muted-foreground">
                Add-ons — pick any, or none
              </span>
              <div className="flex flex-wrap gap-2">
                {ADDONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAddon(a.id)}
                    className={cn(
                      "h-9 rounded-md px-4 text-sm font-medium transition",
                      addons.has(a.id)
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-foreground hover:bg-muted"
                    )}
                  >
                    {a.id === "waterproof" ? "Waterproof case" : "3D-printed case"}{" "}
                    + ${a.price}
                  </button>
                ))}
              </div>
              <span className="text-[13px] leading-snug text-muted-foreground">
                The waterproof case is sealed for wet-season deployment; the
                printed case is lighter and its files are open, so you can print
                your own. Accessory prices are provisional.
              </span>
            </div>

            <div className="h-px bg-border" />

            {/* Ship to + Units */}
            <div className="flex flex-wrap items-end gap-5">
              <div
                className="flex flex-[1_1_200px] flex-col gap-2"
                style={{ maxWidth: "260px" }}
              >
                <span className="text-[13px] text-muted-foreground">
                  Ship to
                </span>
                <Select value={shipTo} onValueChange={setShipTo}>
                  <SelectTrigger className="h-10 w-full">
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
              <div className="flex flex-none flex-col gap-2">
                <span className="text-[13px] text-muted-foreground">Units</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUnits((u) => Math.max(1, u - 1))}
                    disabled={units <= 1}
                    className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition hover:bg-muted disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="min-w-[32px] text-center font-mono text-[15px]">
                    {units}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUnits((u) => u + 1)}
                    className="flex size-9 items-center justify-center rounded-md border border-border text-foreground transition hover:bg-muted"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Total + Pre-order */}
            <div className="flex flex-wrap items-center justify-end gap-4">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[13px] text-muted-foreground">
                  {units > 1 ? `${units} units` : "Total"}
                </span>
                <span className="font-mono text-[22px]">${total}</span>
              </div>
              <button
                type="button"
                className="h-11 rounded-full bg-primary px-6 text-base font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Pre-order
              </button>
            </div>
          </div>

          {/* Bottom notes */}
          <div className="flex flex-wrap gap-3 text-sm" style={{ gap: "12px 28px" }}>
            <span className="inline-flex items-center gap-2" style={{ color: "color-mix(in srgb,var(--foreground) 80%,transparent)" }}>
              <CheckIcon />
              Assembled board and firmware
            </span>
            <span className="inline-flex items-center gap-2" style={{ color: "color-mix(in srgb,var(--foreground) 80%,transparent)" }}>
              <CheckIcon />
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
      <section
        id="specs"
        className="bg-muted"
        style={{ padding: "clamp(48px,7vw,88px) clamp(12px,4vw,32px)" }}
      >
        <div
          className="mx-auto flex flex-col gap-5"
          style={{ maxWidth: "56rem" }}
        >
          <h2
            className="m-0 font-instrument italic font-normal tracking-[-0.01em]"
            style={{
              fontSize: "clamp(28px,4.4vw,44px)",
              lineHeight: 1.06,
            }}
          >
            Specifications
          </h2>
          <p
            className="m-0 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]"
            style={{ maxWidth: "36rem" }}
          >
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
                <AccordionTrigger className="py-4 text-left font-instrument text-lg italic hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
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
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-4"
        style={{
          opacity: showBar ? 1 : 0,
          transform: showBar ? "translateY(0)" : "translateY(100%)",
          transition:
            "opacity 300ms cubic-bezier(0.25,0.1,0.25,1), transform 300ms cubic-bezier(0.25,0.1,0.25,1)",
        }}
      >
        <div
          className="pointer-events-auto flex w-full max-w-[420px] items-center justify-between gap-3 rounded-full border border-border shadow-lg backdrop-blur-xl"
          style={{
            padding: "8px 8px 8px 18px",
            background: "color-mix(in srgb,var(--background) 88%,transparent)",
          }}
        >
          <div className="flex min-w-0 flex-col gap-px">
            <span className="font-mono text-sm">${total}</span>
            <span className="truncate text-[11.5px] text-muted-foreground">
              {barSummary}
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToConfigure}
            className="h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Pre-order
          </button>
        </div>
      </div>

      {/* Bottom padding for sticky bar */}
      <div className="h-24" aria-hidden="true" />
    </div>
  );
}
