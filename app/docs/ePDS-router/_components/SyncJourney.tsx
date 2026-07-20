"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Node centers inside the SVG viewBox.
const PDS = { x: 130, y: 120 };
const ROUTER = { x: 560, y: 120 };

// Which direction the sync "packet" travels per step (null = no travel).
const STEP_FLOW: ({ from: { x: number; y: number }; to: { x: number; y: number } } | null)[] = [
  null, // the host's script gathers emails locally
  null, // fingerprints are made on the host's own machine
  { from: PDS, to: ROUTER }, // the snapshot is pushed
  null, // snapshot swap inside the router
];

const PLAY_INTERVAL_MS = 3400;

// Step-through animation of the host-initiated push loop: a script next
// to the PDS gathers its account emails locally, scrambles each one into
// a fingerprint at home, pushes the snapshot to the router, and the
// router swaps it in atomically (after a second scrambling of its own).
export function SyncJourney() {
  const t = useTranslations("common.epdsRouter.sync");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Literal keys so the static i18n checker can verify every message exists.
  const steps = [
    { title: t("steps.s1.title"), text: t("steps.s1.text") },
    { title: t("steps.s2.title"), text: t("steps.s2.text") },
    { title: t("steps.s3.title"), text: t("steps.s3.text") },
    { title: t("steps.s4.title"), text: t("steps.s4.text") },
  ];
  const total = steps.length;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((current) => {
        if (current >= total - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, total]);

  const flow = STEP_FLOW[step];

  return (
    <div>
      <svg viewBox="0 0 700 260" className="mx-auto block w-full" style={{ maxWidth: 640 }} role="img" aria-label={t("ariaLabel")}>
        {/* Border-to-border so the line never crosses the boxes. */}
        <line
          x1={PDS.x + 66}
          y1={PDS.y}
          x2={ROUTER.x - 66}
          y2={ROUTER.y}
          stroke={flow ? "var(--primary)" : "var(--border)"}
          strokeWidth={flow ? 1.5 : 1}
          strokeDasharray={flow ? undefined : "3 4"}
        />

        {/* PDS node */}
        <g>
          <rect x={PDS.x - 66} y={PDS.y - 26} width={132} height={52} rx={12} fill="var(--background)" stroke={step <= 2 ? "var(--primary)" : "var(--border)"} strokeWidth={1.2} />
          <text x={PDS.x} y={PDS.y + 4} textAnchor="middle" className="fill-foreground" style={{ font: "500 13px var(--font-sans, sans-serif)" }}>
            {t("nodes.pds")}
          </text>
        </g>

        {/* Router node with index drawer */}
        <g>
          <rect x={ROUTER.x - 66} y={ROUTER.y - 26} width={132} height={52} rx={12} fill="var(--background)" stroke={step >= 3 ? "var(--primary)" : "var(--border)"} strokeWidth={1.2} />
          <text x={ROUTER.x} y={ROUTER.y + 4} textAnchor="middle" className="fill-foreground" style={{ font: "500 13px var(--font-sans, sans-serif)" }}>
            {t("nodes.router")}
          </text>
          <rect x={ROUTER.x - 66} y={ROUTER.y + 40} width={132} height={30} rx={8} fill="var(--muted)" opacity={step >= 3 ? 1 : 0.5} />
          <text x={ROUTER.x} y={ROUTER.y + 59} textAnchor="middle" className="fill-muted-foreground" style={{ font: "10.5px var(--font-sans, sans-serif)" }}>
            {t("nodes.index")}
          </text>
        </g>

        {/* Email-to-fingerprint morph — happens on the host's own machine
            (steps 1–2), before anything leaves it. During the push (step 3)
            only the fingerprint is shown travelling. */}
        <AnimatePresence mode="wait">
          <motion.text
            key={step}
            x={step <= 1 ? PDS.x - 60 : (PDS.x + ROUTER.x) / 2}
            y={step <= 1 ? PDS.y - 42 : PDS.y - 24}
            textAnchor={step <= 1 ? "start" : "middle"}
            className="fill-muted-foreground"
            style={{ font: "11.5px var(--font-mono, monospace)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: step <= 2 ? 1 : 0 }}
            exit={{ opacity: 0 }}
          >
            {step === 0 ? "maya@example.com" : step === 1 ? "maya@example.com → 3f9c…b2d1" : step === 2 ? "3f9c…b2d1" : ""}
          </motion.text>
        </AnimatePresence>

        {/* Travelling packet */}
        {flow && (
          <motion.circle
            key={step}
            r={6}
            fill="var(--primary)"
            initial={{ cx: flow.from.x + (flow.from.x < flow.to.x ? 70 : -70), cy: flow.from.y }}
            animate={{ cx: flow.to.x + (flow.from.x < flow.to.x ? -70 : 70), cy: flow.to.y }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
          />
        )}
      </svg>

      <div className="mx-auto mt-2 min-h-[84px] max-w-xl rounded-xl border border-border/60 bg-muted/30 px-5 py-4 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <div className="text-[13.5px] font-medium text-foreground">{steps[step].title}</div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{steps[step].text}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-primary/50"
        >
          {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
          {playing ? t("pause") : t("play")}
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          aria-label={t("back")}
          className={cn("rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50", step === 0 && "opacity-40")}
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
        </button>
        <span className="font-mono text-[11px] text-muted-foreground/70">{t("stepLabel", { n: step + 1, total })}</span>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
          disabled={step === total - 1}
          aria-label={t("next")}
          className={cn("rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50", step === total - 1 && "opacity-40")}
        >
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
