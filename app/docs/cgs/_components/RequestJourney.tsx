"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeId = "app" | "pds" | "cgs" | "gpds";

// Node centers inside the SVG viewBox.
const NODES: Record<NodeId, { x: number; y: number }> = {
  app: { x: 90, y: 190 },
  pds: { x: 270, y: 80 },
  cgs: { x: 450, y: 190 },
  gpds: { x: 630, y: 80 },
};

// Which node the request "packet" sits at, and which edge lights up, per step.
const STEP_FLOW: { at: NodeId; edge?: [NodeId, NodeId] }[] = [
  { at: "app" },
  { at: "pds", edge: ["app", "pds"] },
  { at: "cgs", edge: ["pds", "cgs"] },
  { at: "cgs" },
  { at: "cgs" },
  { at: "cgs" },
  { at: "cgs" },
  { at: "gpds", edge: ["cgs", "gpds"] },
  { at: "app", edge: ["app", "pds"] },
];

const EDGES: [NodeId, NodeId][] = [
  ["app", "pds"],
  ["pds", "cgs"],
  ["cgs", "gpds"],
];

const PLAY_INTERVAL_MS = 3400;

// The centerpiece of the explainer: a step-through animation of one write
// request traveling from the user's app, through their own PDS, into the
// group service's checks, and finally onto the group's PDS.
export function RequestJourney() {
  const t = useTranslations("common.cgs.journey");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Literal keys so the static i18n checker can verify every message exists.
  const steps = [
    { title: t("steps.s1.title"), text: t("steps.s1.text") },
    { title: t("steps.s2.title"), text: t("steps.s2.text") },
    { title: t("steps.s3.title"), text: t("steps.s3.text") },
    { title: t("steps.s4.title"), text: t("steps.s4.text") },
    { title: t("steps.s5.title"), text: t("steps.s5.text") },
    { title: t("steps.s6.title"), text: t("steps.s6.text") },
    { title: t("steps.s7.title"), text: t("steps.s7.text") },
    { title: t("steps.s8.title"), text: t("steps.s8.text") },
    { title: t("steps.s9.title"), text: t("steps.s9.text") },
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
  const packet = NODES[flow.at];
  const labels: Record<NodeId, string> = {
    app: t("nodes.app"),
    pds: t("nodes.pds"),
    cgs: t("nodes.cgs"),
    gpds: t("nodes.gpds"),
  };

  return (
    <div>
      <svg viewBox="0 0 720 270" className="mx-auto block w-full" style={{ maxWidth: 640 }} role="img" aria-label={t("ariaLabel")}>
        {EDGES.map(([a, b]) => {
          const active = flow.edge && ((flow.edge[0] === a && flow.edge[1] === b) || (flow.edge[0] === b && flow.edge[1] === a));
          return (
            <line
              key={`${a}-${b}`}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              stroke={active ? "var(--primary)" : "var(--border)"}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={active ? undefined : "3 4"}
            />
          );
        })}

        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const node = NODES[id];
          const active = flow.at === id;
          return (
            <g key={id}>
              <rect
                x={node.x - 66}
                y={node.y - 23}
                width={132}
                height={46}
                rx={12}
                fill="var(--background)"
                stroke={active ? "var(--primary)" : "var(--border)"}
                strokeWidth={active ? 1.6 : 1}
              />
              <text
                x={node.x}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize="13"
                className="font-mono"
                fill={active ? "var(--primary)" : "var(--muted-foreground)"}
              >
                {labels[id]}
              </text>
            </g>
          );
        })}

        {/* The packet floats just above its current node so it never covers the label. */}
        <motion.g
          initial={false}
          animate={{ x: packet.x, y: packet.y - 34 }}
          transition={{ type: "spring", stiffness: 55, damping: 14 }}
        >
          <circle r={12} fill="var(--primary)" opacity={0.18}>
            <animate attributeName="r" values="9;14;9" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r={6} fill="var(--primary)" />
        </motion.g>
      </svg>

      <div className="mx-auto mt-2 max-w-xl">
        <div className="flex items-center justify-between gap-3">
          <ControlButton onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} label={t("back")}>
            <ArrowLeftIcon className="h-4 w-4" />
          </ControlButton>

          <div className="flex items-center gap-2.5">
            <ControlButton
              onClick={() => {
                if (!playing && step >= total - 1) setStep(0);
                setPlaying((p) => !p);
              }}
              label={playing ? t("pause") : t("play")}
              accent
            >
              {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            </ControlButton>
            <div className="flex items-center gap-1.5">
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={t("stepLabel", { n: i + 1, total })}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => {
                    setPlaying(false);
                    setStep(i);
                  }}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === step ? "w-5 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/40",
                  )}
                />
              ))}
            </div>
          </div>

          <ControlButton onClick={() => setStep((s) => Math.min(total - 1, s + 1))} disabled={step === total - 1} label={t("next")}>
            <ArrowRightIcon className="h-4 w-4" />
          </ControlButton>
        </div>

        <div className="mt-5 min-h-[7.5rem] text-center sm:min-h-[6rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
                {t("stepLabel", { n: step + 1, total })}
              </div>
              <div className="text-[15px] font-medium text-foreground">{steps[step].title}</div>
              <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
                {steps[step].text}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  label,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        accent
          ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
          : "border-border/70 text-muted-foreground hover:text-foreground",
        disabled && "cursor-default opacity-30 hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
