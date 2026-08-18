"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

type NodeId = "m-profile" | "m-post" | "m-obs" | "k-profile" | "k-like" | "k-follow";

// Two tiny repos, side by side, with records as clickable boxes. Edges are
// at-uri references: Kai's like points at Maria's post, Kai's follow points
// at Maria herself, and Maria's post points at her own observation. The
// at-uris shown are illustrative technical identifiers and stay verbatim.
const NODES: Record<NodeId, { x: number; y: number; uri: string; links: NodeId[] }> = {
  "m-profile": { x: 185, y: 92, uri: "at://maria.example/profile/self", links: [] },
  "m-post": { x: 185, y: 172, uri: "at://maria.example/post/3k2a", links: ["m-obs"] },
  "m-obs": { x: 185, y: 252, uri: "at://maria.example/observation/9f3x", links: [] },
  "k-profile": { x: 535, y: 92, uri: "at://kai.example/profile/self", links: [] },
  "k-like": { x: 535, y: 172, uri: "at://kai.example/like/7pq2", links: ["m-post"] },
  "k-follow": { x: 535, y: 252, uri: "at://kai.example/follow/1zzc", links: ["m-profile"] },
};

const NODE_W = 168;
const NODE_H = 44;

export function RecordWeb() {
  const t = useTranslations("common.atproto.records");
  const [selected, setSelected] = useState<NodeId>("k-like");

  // Literal keys so the static i18n checker can verify every message exists.
  const labels: Record<NodeId, string> = {
    "m-profile": t("nodes.profile"),
    "m-post": t("nodes.post"),
    "m-obs": t("nodes.observation"),
    "k-profile": t("nodes.profile"),
    "k-like": t("nodes.like"),
    "k-follow": t("nodes.follow"),
  };
  const details: Record<NodeId, string> = {
    "m-profile": t("details.mProfile"),
    "m-post": t("details.mPost"),
    "m-obs": t("details.mObs"),
    "k-profile": t("details.kProfile"),
    "k-like": t("details.kLike"),
    "k-follow": t("details.kFollow"),
  };

  const activeLinks = NODES[selected].links;

  return (
    <div>
      <svg viewBox="0 0 720 310" className="mx-auto block w-full" style={{ maxWidth: 640 }} role="img" aria-label={t("aria")}>
        <defs>
          <marker id="atp-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--primary)" />
          </marker>
        </defs>

        {/* the two repos */}
        <RepoBox x={40} label={t("repoOfMaria")} />
        <RepoBox x={390} label={t("repoOfKai")} />

        {/* edges: drawn from box edge to box edge */}
        <Edge from="k-like" to="m-post" active={selected === "k-like"} />
        <Edge from="k-follow" to="m-profile" active={selected === "k-follow"} />
        <Edge from="m-post" to="m-obs" vertical active={selected === "m-post"} />

        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const node = NODES[id];
          const isSelected = selected === id;
          const isTarget = activeLinks.includes(id);
          return (
            <g key={id} onClick={() => setSelected(id)} className="cursor-pointer" role="button" aria-label={labels[id]}>
              <rect
                x={node.x - NODE_W / 2}
                y={node.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={isSelected ? "var(--primary)" : "var(--background)"}
                stroke={isSelected || isTarget ? "var(--primary)" : "var(--border)"}
                strokeWidth={isSelected || isTarget ? 1.5 : 1}
              />
              <text
                x={node.x}
                y={node.y + 4.5}
                textAnchor="middle"
                fontSize="12.5"
                className="font-mono"
                fill={isSelected ? "var(--primary-foreground)" : isTarget ? "var(--primary)" : "var(--muted-foreground)"}
              >
                {labels[id]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mx-auto mt-4 max-w-xl rounded-xl border border-border/60 px-5 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="w-fit max-w-full truncate rounded-md border border-primary/40 px-2 py-1 font-mono text-[11px] text-primary">
              {NODES[selected].uri}
            </div>
            <p className="m-0 mt-2.5 text-[13px] leading-relaxed text-muted-foreground">{details[selected]}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mx-auto mt-4 max-w-xl text-center text-[12.5px] leading-relaxed text-muted-foreground/80">
        {t("caption")}
      </p>
    </div>
  );
}

function RepoBox({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <rect x={x} y={36} width={290} height={252} rx={16} fill="none" stroke="var(--border)" strokeDasharray="4 5" />
      <text x={x + 145} y={26} textAnchor="middle" fontSize="11" className="font-mono" fill="var(--muted-foreground)">
        {label}
      </text>
    </g>
  );
}

function Edge({ from, to, active, vertical }: { from: NodeId; to: NodeId; active: boolean; vertical?: boolean }) {
  const a = NODES[from];
  const b = NODES[to];
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  if (vertical) {
    x1 = a.x;
    y1 = a.y + NODE_H / 2;
    x2 = b.x;
    y2 = b.y - NODE_H / 2 - 3;
  } else {
    x1 = a.x - NODE_W / 2;
    y1 = a.y;
    x2 = b.x + NODE_W / 2 + 4;
    y2 = b.y;
  }
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={active ? "var(--primary)" : "var(--border)"}
      strokeWidth={active ? 1.5 : 1}
      markerEnd={active ? "url(#atp-arr)" : undefined}
      className={cn("transition-all", active && "opacity-100")}
    />
  );
}
