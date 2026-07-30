"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

type NodeId = "site" | "project" | "cert" | "dataset" | "observation" | "evidence" | "account";

type Node = { id: Exclude<NodeId, "account">; x: number; y: number };

// Node centers inside the SVG viewBox. The whole grid sits inside one rounded
// container: the account that stores every record on the page.
const NODES: Node[] = [
  { id: "site", x: 105, y: 130 },
  { id: "project", x: 330, y: 130 },
  { id: "cert", x: 600, y: 130 },
  { id: "dataset", x: 330, y: 250 },
  { id: "observation", x: 330, y: 375 },
  { id: "evidence", x: 600, y: 375 },
];

type Edge = {
  from: Exclude<NodeId, "account">;
  to: Exclude<NodeId, "account">;
  /** Optional quadratic control point; straight line when omitted. */
  control?: { x: number; y: number };
  /** Where the field name is drawn. */
  label: { x: number; y: number };
  /** The literal field that carries the link. Protocol wire name, untranslated. */
  field: string;
};

// Every arrow on the map is a real field in a real record.
const EDGES: Edge[] = [
  { from: "project", to: "cert", label: { x: 465, y: 122 }, field: "items[]" },
  { from: "project", to: "dataset", label: { x: 330, y: 194 }, field: "items[]" },
  { from: "dataset", to: "observation", label: { x: 330, y: 316 }, field: "datasetRef" },
  {
    from: "observation",
    to: "project",
    control: { x: 520, y: 252 },
    label: { x: 468, y: 256 },
    field: "projectRef",
  },
  { from: "observation", to: "site", label: { x: 196, y: 245 }, field: "siteRef" },
  {
    from: "cert",
    to: "site",
    control: { x: 350, y: 40 },
    label: { x: 352, y: 80 },
    field: "locations[]",
  },
  { from: "evidence", to: "observation", label: { x: 465, y: 367 }, field: "occurrenceRef" },
];

const BOX_W = 150;
const BOX_H = 46;

const byId = Object.fromEntries(NODES.map((node) => [node.id, node])) as Record<Node["id"], Node>;

function edgePath(edge: Edge): string {
  const a = byId[edge.from];
  const b = byId[edge.to];
  if (!edge.control) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} Q ${edge.control.x} ${edge.control.y} ${b.x} ${b.y}`;
}

/**
 * The centrepiece: every record on the page and the exact field that ties it to
 * its neighbour. Tap a box (or the account frame around them) to light up its
 * links and read, in plain language, what the arrows mean.
 */
export function LinkMap() {
  const t = useTranslations("common.dataModel.map");
  const [selected, setSelected] = useState<NodeId>("observation");

  // Literal keys so the static i18n checker can verify every message exists.
  const names: Record<NodeId, string> = {
    site: t("nodes.site.name"),
    project: t("nodes.project.name"),
    cert: t("nodes.cert.name"),
    dataset: t("nodes.dataset.name"),
    observation: t("nodes.observation.name"),
    evidence: t("nodes.evidence.name"),
    account: t("nodes.account.name"),
  };
  const descs: Record<NodeId, string> = {
    site: t("nodes.site.desc"),
    project: t("nodes.project.desc"),
    cert: t("nodes.cert.desc"),
    dataset: t("nodes.dataset.desc"),
    observation: t("nodes.observation.desc"),
    evidence: t("nodes.evidence.desc"),
    account: t("nodes.account.desc"),
  };

  const accountActive = selected === "account";

  function isEdgeActive(edge: Edge): boolean {
    if (accountActive) return false;
    return edge.from === selected || edge.to === selected;
  }

  return (
    <div>
      <svg
        viewBox="0 0 780 470"
        className="mx-auto block w-full"
        style={{ maxWidth: 700 }}
        role="group"
        aria-label={t("ariaLabel")}
      >
        {/* The account frame. Clicking it explains that "belonging to" an
            organization simply means "stored in the organization's account". */}
        <g
          role="button"
          tabIndex={0}
          aria-pressed={accountActive}
          aria-label={names.account}
          className="cursor-pointer outline-none"
          onClick={() => setSelected("account")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setSelected("account");
            }
          }}
        >
          <rect
            x={16}
            y={16}
            width={748}
            height={438}
            rx={26}
            fill={accountActive ? "var(--primary)" : "transparent"}
            fillOpacity={accountActive ? 0.06 : 1}
            stroke={accountActive ? "var(--primary)" : "var(--border)"}
            strokeWidth={accountActive ? 1.6 : 1}
            strokeDasharray="6 6"
          />
          <text
            x={40}
            y={444}
            fontSize="12"
            className="font-mono"
            fill={accountActive ? "var(--primary)" : "var(--muted-foreground)"}
          >
            {names.account}
          </text>
        </g>

        {EDGES.map((edge) => {
          const active = isEdgeActive(edge);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <path
                d={edgePath(edge)}
                fill="none"
                stroke={active ? "var(--primary)" : "var(--border)"}
                strokeWidth={active ? 1.6 : 1}
                strokeDasharray={active ? undefined : "3 4"}
              />
              <text
                x={edge.label.x}
                y={edge.label.y}
                textAnchor="middle"
                fontSize="11"
                className="font-mono"
                fill={active ? "var(--primary)" : "var(--muted-foreground)"}
                opacity={active ? 1 : 0.45}
              >
                {edge.field}
              </text>
            </g>
          );
        })}

        {NODES.map((node) => {
          const active = selected === node.id;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              className="cursor-pointer outline-none"
              onClick={() => setSelected(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(node.id);
                }
              }}
            >
              <rect
                x={node.x - BOX_W / 2}
                y={node.y - BOX_H / 2}
                width={BOX_W}
                height={BOX_H}
                rx={12}
                fill={active ? "var(--primary)" : "var(--background)"}
                stroke={active ? "var(--primary)" : "var(--border)"}
                strokeWidth={active ? 1.6 : 1}
              />
              <text
                x={node.x}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize="13"
                fill={active ? "var(--primary-foreground)" : "var(--muted-foreground)"}
              >
                {node.id === "site" && names.site}
                {node.id === "project" && names.project}
                {node.id === "cert" && names.cert}
                {node.id === "dataset" && names.dataset}
                {node.id === "observation" && names.observation}
                {node.id === "evidence" && names.evidence}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mx-auto mt-3 max-w-xl">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="min-h-[6.5rem] rounded-xl border border-border/60 bg-muted/40 px-5 py-4 text-center"
          >
            <div className="mb-1 font-mono text-[12.5px] text-primary">{names[selected]}</div>
            <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">{descs[selected]}</p>
          </motion.div>
        </AnimatePresence>
        <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground/70">{t("hint")}</p>
      </div>
    </div>
  );
}
