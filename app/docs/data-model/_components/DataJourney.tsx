"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeId = "observation" | "evidence" | "dataset" | "project" | "cert";
type EdgeId = "evidenceLink" | "datasetLink" | "projectLink" | "nestLink" | "certLink";

const NODES: Record<NodeId, { x: number; y: number }> = {
  project: { x: 180, y: 75 },
  cert: { x: 480, y: 75 },
  dataset: { x: 180, y: 165 },
  observation: { x: 180, y: 255 },
  evidence: { x: 480, y: 255 },
};

type Edge = {
  from: NodeId;
  to: NodeId;
  control?: { x: number; y: number };
  label: { x: number; y: number };
  /** Real field name on the wire, so it stays untranslated. */
  field: string;
};

const EDGES: Record<EdgeId, Edge> = {
  evidenceLink: { from: "evidence", to: "observation", label: { x: 330, y: 247 }, field: "occurrenceRef" },
  datasetLink: { from: "observation", to: "dataset", label: { x: 240, y: 215 }, field: "datasetRef" },
  projectLink: {
    from: "observation",
    to: "project",
    control: { x: 390, y: 165 },
    label: { x: 300, y: 170 },
    field: "projectRef",
  },
  nestLink: { from: "dataset", to: "project", label: { x: 138, y: 125 }, field: "items[]" },
  certLink: { from: "project", to: "cert", label: { x: 330, y: 67 }, field: "items[]" },
};

// What has been built by the end of each step, and what is newly added (and so
// highlighted) on that step.
const STEPS: { nodes: NodeId[]; edges: EdgeId[]; newNode?: NodeId; newEdge?: EdgeId; frame?: boolean }[] = [
  { nodes: ["observation"], edges: [], newNode: "observation" },
  { nodes: ["observation", "evidence"], edges: ["evidenceLink"], newNode: "evidence", newEdge: "evidenceLink" },
  {
    nodes: ["observation", "evidence", "dataset"],
    edges: ["evidenceLink", "datasetLink"],
    newNode: "dataset",
    newEdge: "datasetLink",
  },
  {
    nodes: ["observation", "evidence", "dataset", "project"],
    edges: ["evidenceLink", "datasetLink", "projectLink"],
    newNode: "project",
    newEdge: "projectLink",
  },
  {
    nodes: ["observation", "evidence", "dataset", "project"],
    edges: ["evidenceLink", "datasetLink", "projectLink", "nestLink"],
    newEdge: "nestLink",
  },
  {
    nodes: ["observation", "evidence", "dataset", "project", "cert"],
    edges: ["evidenceLink", "datasetLink", "projectLink", "nestLink", "certLink"],
    newNode: "cert",
    newEdge: "certLink",
  },
  {
    nodes: ["observation", "evidence", "dataset", "project", "cert"],
    edges: ["evidenceLink", "datasetLink", "projectLink", "nestLink", "certLink"],
    frame: true,
  },
];

const BOX_W = 150;
const BOX_H = 44;
const PLAY_INTERVAL_MS = 4200;

function edgePath(edge: Edge): string {
  const a = NODES[edge.from];
  const b = NODES[edge.to];
  if (!edge.control) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} Q ${edge.control.x} ${edge.control.y} ${b.x} ${b.y}`;
}

/**
 * The story of one sighting, told as a picture that gets built piece by piece:
 * a photo becomes an observation, observations become a dataset, the dataset
 * joins a project, and finally the whole thing is filed in an organization's
 * account.
 */
export function DataJourney() {
  const t = useTranslations("common.dataModel.journey");
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
  ];
  const total = steps.length;
  const labels: Record<NodeId, string> = {
    observation: t("nodes.observation"),
    evidence: t("nodes.evidence"),
    dataset: t("nodes.dataset"),
    project: t("nodes.project"),
    cert: t("nodes.cert"),
  };

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

  const state = STEPS[step];

  return (
    <div>
      <svg
        viewBox="0 0 720 345"
        className="mx-auto block w-full"
        style={{ maxWidth: 640 }}
        role="img"
        aria-label={t("ariaLabel")}
      >
        {/* The organization's account only shows up on the last step: until then
            everything lives in the steward's own account. */}
        <motion.g initial={false} animate={{ opacity: state.frame ? 1 : 0 }} transition={{ duration: 0.25 }}>
          <rect
            x={12}
            y={12}
            width={696}
            height={300}
            rx={24}
            fill="var(--primary)"
            fillOpacity={0.05}
            stroke="var(--primary)"
            strokeWidth={1.4}
            strokeDasharray="6 6"
          />
          <text x={34} y={334} fontSize="12" className="font-mono" fill="var(--primary)">
            {t("nodes.account")}
          </text>
        </motion.g>

        {(Object.keys(EDGES) as EdgeId[]).map((id) => {
          const edge = EDGES[id];
          const visible = state.edges.includes(id);
          const isNew = state.newEdge === id;
          return (
            <motion.g key={id} initial={false} animate={{ opacity: visible ? 1 : 0 }} transition={{ duration: 0.25 }}>
              <path
                d={edgePath(edge)}
                fill="none"
                stroke={isNew ? "var(--primary)" : "var(--border)"}
                strokeWidth={isNew ? 1.6 : 1}
                strokeDasharray={isNew ? undefined : "3 4"}
              />
              <text
                x={edge.label.x}
                y={edge.label.y}
                textAnchor="middle"
                fontSize="11"
                className="font-mono"
                fill={isNew ? "var(--primary)" : "var(--muted-foreground)"}
                opacity={isNew ? 1 : 0.5}
              >
                {edge.field}
              </text>
            </motion.g>
          );
        })}

        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const node = NODES[id];
          const visible = state.nodes.includes(id);
          const isNew = state.newNode === id;
          return (
            <motion.g
              key={id}
              initial={false}
              animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0.94 }}
              style={{ originX: `${node.x}px`, originY: `${node.y}px` }}
              transition={{ duration: 0.25 }}
            >
              <rect
                x={node.x - BOX_W / 2}
                y={node.y - BOX_H / 2}
                width={BOX_W}
                height={BOX_H}
                rx={12}
                fill={isNew ? "var(--primary)" : "var(--background)"}
                stroke={isNew ? "var(--primary)" : "var(--border)"}
                strokeWidth={isNew ? 1.6 : 1}
              />
              <text
                x={node.x}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize="13"
                fill={isNew ? "var(--primary-foreground)" : "var(--muted-foreground)"}
              >
                {id === "observation" && labels.observation}
                {id === "evidence" && labels.evidence}
                {id === "dataset" && labels.dataset}
                {id === "project" && labels.project}
                {id === "cert" && labels.cert}
              </text>
            </motion.g>
          );
        })}
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

          <ControlButton
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            disabled={step === total - 1}
            label={t("next")}
          >
            <ArrowRightIcon className="h-4 w-4" />
          </ControlButton>
        </div>

        <div className="mt-5 min-h-[8rem] text-center sm:min-h-[6.5rem]">
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
