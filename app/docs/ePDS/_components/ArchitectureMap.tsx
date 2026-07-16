"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

type NodeId = "app" | "pds" | "auth" | "email" | "db";

const NODES: { id: NodeId; x: number; y: number }[] = [
  { id: "app", x: 130, y: 80 },
  { id: "pds", x: 380, y: 80 },
  { id: "email", x: 130, y: 220 },
  { id: "auth", x: 380, y: 220 },
  { id: "db", x: 630, y: 150 },
];

const EDGES: [NodeId, NodeId][] = [
  ["app", "pds"],
  ["pds", "auth"],
  ["pds", "db"],
  ["auth", "email"],
  ["auth", "db"],
];

const BOX_W = 170;
const BOX_H = 54;

// A clickable service map. Selecting a node highlights it plus its direct
// connections and shows a plain-language description of its job below.
export function ArchitectureMap() {
  const t = useTranslations("common.epds.map");
  const [selected, setSelected] = useState<NodeId>("pds");

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, (typeof NODES)[number]>;

  return (
    <div>
      <svg viewBox="0 0 760 300" className="mx-auto block w-full" style={{ maxWidth: 680 }} role="group" aria-label={t("ariaLabel")}>
        {EDGES.map(([a, b]) => {
          const active = selected === a || selected === b;
          return (
            <line
              key={`${a}-${b}`}
              x1={byId[a].x}
              y1={byId[a].y}
              x2={byId[b].x}
              y2={byId[b].y}
              stroke={active ? "var(--primary)" : "var(--border)"}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={active ? undefined : "3 4"}
            />
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
                className="font-mono"
                fill={active ? "var(--primary-foreground)" : "var(--muted-foreground)"}
              >
                {/* Literal keys keep the static i18n checker happy. */}
                {node.id === "app" && t("nodes.app.name")}
                {node.id === "pds" && t("nodes.pds.name")}
                {node.id === "auth" && t("nodes.auth.name")}
                {node.id === "email" && t("nodes.email.name")}
                {node.id === "db" && t("nodes.db.name")}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mx-auto mt-4 max-w-xl">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="min-h-[6rem] rounded-xl border border-border/60 bg-muted/40 px-5 py-4 text-center"
          >
            <div className="mb-1 font-mono text-[12.5px] text-primary">
              {selected === "app" && t("nodes.app.name")}
              {selected === "pds" && t("nodes.pds.name")}
              {selected === "auth" && t("nodes.auth.name")}
              {selected === "email" && t("nodes.email.name")}
              {selected === "db" && t("nodes.db.name")}
            </div>
            <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
              {selected === "app" && t("nodes.app.desc")}
              {selected === "pds" && t("nodes.pds.desc")}
              {selected === "auth" && t("nodes.auth.desc")}
              {selected === "email" && t("nodes.email.desc")}
              {selected === "db" && t("nodes.db.desc")}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
