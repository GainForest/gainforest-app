"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PdsId = "forest" | "ocean" | "river";

// Sample addresses are data, not copy — identical in every locale.
const SCENARIOS = [
  { email: "maya@example.com", homes: ["forest"] as PdsId[], outcome: "one" as const },
  { email: "kai@example.com", homes: ["forest", "ocean"] as PdsId[], outcome: "many" as const },
  { email: "new@example.com", homes: [] as PdsId[], outcome: "none" as const },
];

// Node centers inside the SVG viewBox.
const NODES: Record<"app" | "router" | PdsId, { x: number; y: number }> = {
  app: { x: 100, y: 165 },
  router: { x: 330, y: 165 },
  forest: { x: 590, y: 60 },
  ocean: { x: 590, y: 165 },
  river: { x: 590, y: 270 },
};

const PDS_IDS: PdsId[] = ["forest", "ocean", "river"];
const NODE_HALF_W = 62; // half the node box width — edges stop at box borders
const STEP_MS = 1900;

// Endpoint of an edge leaving a node horizontally toward a target,
// clipped to the node's border so lines never cross the boxes.
function edgeEnd(node: { x: number; y: number }, towardRight: boolean) {
  return { x: node.x + (towardRight ? NODE_HALF_W : -NODE_HALF_W), y: node.y };
}

// A toy multi-server network: pick an email and watch the router turn it
// into a fingerprint, match it against each server's set, and hand the
// app a routing decision (one home, several homes, or none yet).
export function RouterLookupDemo() {
  const t = useTranslations("common.epdsRouter.demo");
  const [scenario, setScenario] = useState<number | null>(null);
  const [step, setStep] = useState(0); // 0 idle, 1 sent, 2 fingerprint, 3 outcome

  useEffect(() => {
    if (scenario === null || step >= 3) return;
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [scenario, step]);

  const run = (i: number) => {
    setScenario(i);
    setStep(1);
  };

  const active = scenario === null ? null : SCENARIOS[scenario];
  const matched = step >= 3 && active ? active.homes : [];
  const pdsLabels: Record<PdsId, string> = {
    forest: t("nodes.forest"),
    ocean: t("nodes.ocean"),
    river: t("nodes.river"),
  };

  // Literal keys so the static i18n checker can verify every message exists.
  const outcome =
    active === null
      ? null
      : active.outcome === "one"
        ? { title: t("outcomes.one.title"), text: t("outcomes.one.text") }
        : active.outcome === "many"
          ? { title: t("outcomes.many.title"), text: t("outcomes.many.text") }
          : { title: t("outcomes.none.title"), text: t("outcomes.none.text") };

  const caption =
    scenario === null
      ? { title: t("steps.idle.title"), text: t("steps.idle.text") }
      : step === 1
        ? { title: t("steps.sent.title"), text: t("steps.sent.text") }
        : step === 2
          ? { title: t("steps.fingerprint.title"), text: t("steps.fingerprint.text") }
          : outcome!;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.email}
            type="button"
            onClick={() => run(i)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 font-mono text-[12px] transition-colors",
              scenario === i
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {s.email}
          </button>
        ))}
        {scenario !== null && step >= 3 && (
          <button
            type="button"
            onClick={() => {
              setScenario(null);
              setStep(0);
            }}
            aria-label={t("reset")}
            className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <svg viewBox="0 0 700 330" className="mx-auto block w-full" style={{ maxWidth: 640 }} role="img" aria-label={t("ariaLabel")}>
        {/* Edges — drawn border-to-border so they never cross the boxes. */}
        <line
          x1={edgeEnd(NODES.app, true).x}
          y1={NODES.app.y}
          x2={edgeEnd(NODES.router, false).x}
          y2={NODES.router.y}
          stroke={step === 1 ? "var(--primary)" : "var(--border)"}
          strokeWidth={step === 1 ? 1.5 : 1}
          strokeDasharray={step === 1 ? undefined : "3 4"}
        />
        {PDS_IDS.map((id) => {
          const hit = matched.includes(id);
          const from = edgeEnd(NODES.router, true);
          const to = edgeEnd(NODES[id], false);
          return (
            <line
              key={id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={hit ? "var(--primary)" : "var(--border)"}
              strokeWidth={hit ? 1.5 : 1}
              strokeDasharray={hit ? undefined : "3 4"}
            />
          );
        })}

        {/* App + router nodes */}
        {(["app", "router"] as const).map((id) => (
          <g key={id}>
            <rect
              x={NODES[id].x - 62}
              y={NODES[id].y - 23}
              width={124}
              height={46}
              rx={12}
              fill="var(--background)"
              stroke={(id === "app" && step <= 1 && scenario !== null) || (id === "router" && step === 2) ? "var(--primary)" : "var(--border)"}
              strokeWidth={1.2}
            />
            <text x={NODES[id].x} y={NODES[id].y + 4} textAnchor="middle" className="fill-foreground" style={{ font: "500 13px var(--font-sans, sans-serif)" }}>
              {id === "app" ? t("nodes.app") : t("nodes.router")}
            </text>
          </g>
        ))}

        {/* Fingerprint badge under the router */}
        <AnimatePresence>
          {step >= 2 && active && (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <rect x={NODES.router.x - 52} y={NODES.router.y + 30} width={104} height={24} rx={7} fill="var(--muted)" />
              <text
                x={NODES.router.x}
                y={NODES.router.y + 46}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ font: "11px var(--font-mono, monospace)" }}
              >
                {step === 2 ? "hmac(…)" : "3f9c…b2d1"}
              </text>
            </motion.g>
          )}
        </AnimatePresence>

        {/* PDS nodes */}
        {PDS_IDS.map((id) => {
          const hit = matched.includes(id);
          const miss = step >= 3 && !hit;
          return (
            <g key={id} opacity={miss ? 0.45 : 1}>
              <rect
                x={NODES[id].x - 62}
                y={NODES[id].y - 23}
                width={124}
                height={46}
                rx={12}
                fill={hit ? "var(--primary)" : "var(--background)"}
                fillOpacity={hit ? 0.12 : 1}
                stroke={hit ? "var(--primary)" : "var(--border)"}
                strokeWidth={hit ? 1.6 : 1}
              />
              <text x={NODES[id].x} y={NODES[id].y + 4} textAnchor="middle" className="fill-foreground" style={{ font: "500 13px var(--font-sans, sans-serif)" }}>
                {pdsLabels[id]}
              </text>
            </g>
          );
        })}

        {/* Travelling packet */}
        {scenario !== null && step >= 1 && step <= 2 && (
          <motion.circle
            r={6}
            fill="var(--primary)"
            initial={{ cx: NODES.app.x + 70, cy: NODES.app.y }}
            animate={{ cx: step === 1 ? NODES.router.x - 70 : NODES.router.x, cy: NODES.router.y }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        )}
      </svg>

      <div className="mx-auto mt-4 min-h-[72px] max-w-xl rounded-xl border border-border/60 bg-muted/30 px-5 py-4 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${scenario}-${step}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <div className="text-[13.5px] font-medium text-foreground">{caption.title}</div>
            <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{caption.text}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
