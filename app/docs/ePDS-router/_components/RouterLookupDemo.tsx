"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PdsId = "forest" | "ocean" | "river";

// Sample addresses and DIDs are data, not copy. Identical in every locale.
const SCENARIOS = [
  {
    email: "maya@example.com",
    accounts: [{ did: "did:plc:m4ya…", home: "forest" as PdsId }],
    outcome: "one" as const,
  },
  {
    email: "kai@example.com",
    accounts: [
      { did: "did:plc:ka1a…", home: "forest" as PdsId },
      { did: "did:plc:ka1b…", home: "ocean" as PdsId },
    ],
    outcome: "many" as const,
  },
  { email: "new@example.com", accounts: [], outcome: "none" as const },
];

// Node centers and half-widths inside the SVG viewBox. The router and
// the identity directory are deliberately separate boxes: the router
// answers with identities, and resolving an identity to its current
// home server is standard AT Protocol work that never touches the
// router.
const NODES = {
  app: { x: 95, y: 180, hw: 54 },
  router: { x: 300, y: 80, hw: 52 },
  directory: { x: 300, y: 280, hw: 74 },
  forest: { x: 620, y: 70, hw: 60 },
  ocean: { x: 620, y: 180, hw: 60 },
  river: { x: 620, y: 290, hw: 60 },
} as const;

type NodeId = keyof typeof NODES;
const PDS_IDS: PdsId[] = ["forest", "ocean", "river"];
const STEP_MS = 2300;

// Edge endpoints clipped to box borders so lines never cross the boxes.
function edge(a: NodeId, b: NodeId) {
  const na = NODES[a];
  const nb = NODES[b];
  const dx = nb.x - na.x;
  const dy = nb.y - na.y;
  const len = Math.hypot(dx, dy);
  // Trim each end by the node's half-width plus a small gap.
  const ta = (na.hw + 8) / len;
  const tb = (nb.hw + 8) / len;
  return {
    x1: na.x + dx * ta,
    y1: na.y + dy * ta,
    x2: nb.x - dx * tb,
    y2: nb.y - dy * tb,
  };
}

type Phase = "idle" | "sent" | "fingerprint" | "answer" | "resolve" | "outcome";

// The step-through: email -> router -> identity (DID) -> directory ->
// home server. A "none" run stops after the router's answer.
export function RouterLookupDemo() {
  const t = useTranslations("common.epdsRouter.demo");
  const [scenario, setScenario] = useState<number | null>(null);
  const [step, setStep] = useState(0);

  const active = scenario === null ? null : SCENARIOS[scenario];
  const phases: Phase[] =
    active === null
      ? ["idle"]
      : active.accounts.length > 0
        ? ["sent", "fingerprint", "answer", "resolve", "outcome"]
        : ["sent", "fingerprint", "outcome"];
  const phase: Phase = active === null ? "idle" : phases[Math.min(step, phases.length - 1)];
  const done = active !== null && step >= phases.length - 1;

  useEffect(() => {
    if (scenario === null || done) return;
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [scenario, step, done]);

  const run = (i: number) => {
    setScenario(i);
    setStep(0);
  };

  const homes: PdsId[] = phase === "outcome" && active ? active.accounts.map((a) => a.home) : [];
  const pdsLabels: Record<PdsId, string> = {
    forest: t("nodes.forest"),
    ocean: t("nodes.ocean"),
    river: t("nodes.river"),
  };

  // Literal keys so the static i18n checker can verify every message exists.
  const caption =
    phase === "idle"
      ? { title: t("steps.idle.title"), text: t("steps.idle.text") }
      : phase === "sent"
        ? { title: t("steps.sent.title"), text: t("steps.sent.text") }
        : phase === "fingerprint"
          ? { title: t("steps.fingerprint.title"), text: t("steps.fingerprint.text") }
          : phase === "answer"
            ? { title: t("steps.answer.title"), text: t("steps.answer.text") }
            : phase === "resolve"
              ? { title: t("steps.resolve.title"), text: t("steps.resolve.text") }
              : active!.outcome === "one"
                ? { title: t("outcomes.one.title"), text: t("outcomes.one.text") }
                : active!.outcome === "many"
                  ? { title: t("outcomes.many.title"), text: t("outcomes.many.text") }
                  : { title: t("outcomes.none.title"), text: t("outcomes.none.text") };

  const appRouter = edge("app", "router");
  const appDirectory = edge("app", "directory");
  const routerBusy = phase === "sent" || phase === "fingerprint" || phase === "answer";
  const showDids = active !== null && active.accounts.length > 0 && (phase === "answer" || phase === "resolve" || phase === "outcome");

  const nodeBox = (id: NodeId, label: string, highlighted: boolean, dimmed = false) => (
    <g key={id} opacity={dimmed ? 0.45 : 1}>
      <rect
        x={NODES[id].x - NODES[id].hw}
        y={NODES[id].y - 23}
        width={NODES[id].hw * 2}
        height={46}
        rx={12}
        fill={highlighted && PDS_IDS.includes(id as PdsId) ? "var(--primary)" : "var(--background)"}
        fillOpacity={highlighted && PDS_IDS.includes(id as PdsId) ? 0.12 : 1}
        stroke={highlighted ? "var(--primary)" : "var(--border)"}
        strokeWidth={highlighted ? 1.6 : 1}
      />
      <text x={NODES[id].x} y={NODES[id].y + 4} textAnchor="middle" className="fill-foreground" style={{ font: "500 12.5px var(--font-sans, sans-serif)" }}>
        {label}
      </text>
    </g>
  );

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
        {scenario !== null && done && (
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

      <svg viewBox="0 0 740 360" className="mx-auto block w-full" style={{ maxWidth: 680 }} role="img" aria-label={t("ariaLabel")}>
        {/* App <-> router: the lookup call */}
        <line
          {...appRouter}
          stroke={phase === "sent" || phase === "answer" ? "var(--primary)" : "var(--border)"}
          strokeWidth={phase === "sent" || phase === "answer" ? 1.5 : 1}
          strokeDasharray={phase === "sent" || phase === "answer" ? undefined : "3 4"}
        />
        {/* App <-> directory: standard AT Protocol resolution */}
        <line
          {...appDirectory}
          stroke={phase === "resolve" ? "var(--primary)" : "var(--border)"}
          strokeWidth={phase === "resolve" ? 1.5 : 1}
          strokeDasharray={phase === "resolve" ? undefined : "3 4"}
        />
        {/* Directory -> each PDS: where identities live */}
        {PDS_IDS.map((id) => {
          const hit = homes.includes(id);
          const e = edge("directory", id);
          return (
            <line
              key={id}
              {...e}
              stroke={hit ? "var(--primary)" : "var(--border)"}
              strokeWidth={hit ? 1.5 : 1}
              strokeDasharray={hit ? undefined : "3 4"}
            />
          );
        })}

        {nodeBox("app", t("nodes.app"), scenario !== null && phase !== "outcome")}
        {nodeBox("router", t("nodes.router"), routerBusy)}
        {nodeBox("directory", t("nodes.directory"), phase === "resolve" || (phase === "outcome" && homes.length > 0))}
        {PDS_IDS.map((id) => nodeBox(id, pdsLabels[id], homes.includes(id), phase === "outcome" && homes.length > 0 && !homes.includes(id)))}

        {/* Fingerprint badge under the router */}
        <AnimatePresence>
          {(phase === "fingerprint" || phase === "answer") && (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <rect x={NODES.router.x - 46} y={NODES.router.y + 30} width={92} height={22} rx={7} fill="var(--muted)" />
              <text x={NODES.router.x} y={NODES.router.y + 45} textAnchor="middle" className="fill-muted-foreground" style={{ font: "10.5px var(--font-mono, monospace)" }}>
                {phase === "fingerprint" ? "sha256(…)" : "3f9c…b2d1"}
              </text>
            </motion.g>
          )}
        </AnimatePresence>

        {/* The router's answer: identity chips near the app */}
        <AnimatePresence>
          {showDids &&
            active!.accounts.map((a, i) => (
              <motion.g key={a.did} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <rect x={NODES.app.x - 52} y={NODES.app.y + 32 + i * 26} width={104} height={22} rx={7} fill="var(--muted)" />
                <text
                  x={NODES.app.x}
                  y={NODES.app.y + 47 + i * 26}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ font: "10.5px var(--font-mono, monospace)" }}
                >
                  {a.did}
                </text>
              </motion.g>
            ))}
        </AnimatePresence>

        {/* Travelling packet */}
        {scenario !== null && (phase === "sent" || phase === "answer" || phase === "resolve") && (
          <motion.circle
            key={`${scenario}-${phase}`}
            r={6}
            fill="var(--primary)"
            initial={{
              cx: phase === "answer" ? appRouter.x2 : appRouter.x1,
              cy: phase === "answer" ? appRouter.y2 : phase === "resolve" ? appDirectory.y1 : appRouter.y1,
            }}
            animate={{
              cx: phase === "sent" ? appRouter.x2 : phase === "answer" ? appRouter.x1 : appDirectory.x2,
              cy: phase === "sent" ? appRouter.y2 : phase === "answer" ? appRouter.y1 : appDirectory.y2,
            }}
            transition={{ duration: 1.0, ease: "easeInOut" }}
          />
        )}
      </svg>

      <div className="mx-auto mt-4 min-h-[84px] max-w-xl rounded-xl border border-border/60 bg-muted/30 px-5 py-4 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${scenario}-${phase}`}
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
