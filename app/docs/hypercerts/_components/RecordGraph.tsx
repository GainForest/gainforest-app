"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";

type NodeId =
  | "collection"
  | "activity"
  | "attachment"
  | "location"
  | "rights"
  | "tag"
  | "receipt"
  | "evaluation";

type LinkId = "items" | "locations" | "rights" | "usedTags" | "subjects" | "for" | "subject";

type Support = "both" | "gainforest" | "maearth";

// Box centers inside the SVG viewBox. Boxes are 160 × 44, so the spine
// (collection → activity) runs down the middle and every other record hangs
// off it. NSIDs are identifiers, not copy, so they stay verbatim per locale.
const NODES: Record<
  NodeId,
  { x: number; y: number; prefix: string; name: string; nsid: string; support: Support; link: LinkId }
> = {
  collection: { x: 380, y: 56, prefix: "org.hypercerts", name: "collection", nsid: "org.hypercerts.collection", support: "both", link: "items" },
  location: { x: 130, y: 200, prefix: "app.certified", name: "location", nsid: "app.certified.location", support: "both", link: "locations" },
  activity: { x: 380, y: 200, prefix: "org.hypercerts.claim", name: "activity", nsid: "org.hypercerts.claim.activity", support: "both", link: "items" },
  rights: { x: 630, y: 200, prefix: "org.hypercerts.claim", name: "rights", nsid: "org.hypercerts.claim.rights", support: "maearth", link: "rights" },
  attachment: { x: 130, y: 340, prefix: "org.hypercerts.context", name: "attachment", nsid: "org.hypercerts.context.attachment", support: "both", link: "subjects" },
  tag: { x: 630, y: 340, prefix: "org.hypercerts.workscope", name: "tag", nsid: "org.hypercerts.workscope.tag", support: "both", link: "usedTags" },
  evaluation: { x: 290, y: 440, prefix: "org.hypercerts.context", name: "evaluation", nsid: "org.hypercerts.context.evaluation", support: "gainforest", link: "subject" },
  receipt: { x: 500, y: 440, prefix: "org.hypercerts.funding", name: "receipt", nsid: "org.hypercerts.funding.receipt", support: "gainforest", link: "for" },
};

// Each edge lights up when either of its endpoints is selected.
const EDGES: {
  id: string;
  from: NodeId;
  to: NodeId;
  d: string;
  label: string;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
  dashed?: boolean;
}[] = [
  { id: "items", from: "activity", to: "collection", d: "M 380,178 L 380,82", label: "items[]", labelX: 392, labelY: 132, anchor: "start" },
  { id: "locations", from: "location", to: "activity", d: "M 210,200 L 296,200", label: "locations[]", labelX: 253, labelY: 190, anchor: "middle" },
  { id: "rights", from: "activity", to: "rights", d: "M 460,200 L 546,200", label: "rights", labelX: 503, labelY: 190, anchor: "middle" },
  { id: "subjectsActivity", from: "attachment", to: "activity", d: "M 210,332 L 299,227", label: "subjects[]", labelX: 228, labelY: 254, anchor: "end" },
  { id: "usedTags", from: "tag", to: "activity", d: "M 552,332 L 462,227", label: "workScope.usedTags[]", labelX: 500, labelY: 262, anchor: "start" },
  {
    id: "subjectsCollection",
    from: "attachment",
    to: "collection",
    d: "M 50,326 C -24,240 -24,80 296,56",
    label: "subjects[]",
    labelX: 56,
    labelY: 290,
    anchor: "start",
    dashed: true,
  },
  { id: "subject", from: "evaluation", to: "activity", d: "M 290,418 L 347,227", label: "subject", labelX: 300, labelY: 300, anchor: "end" },
  { id: "for", from: "receipt", to: "activity", d: "M 500,418 L 414,227", label: "for", labelX: 490, labelY: 300, anchor: "start" },
];

const ORDER: NodeId[] = ["collection", "activity", "attachment", "location", "rights", "tag", "receipt", "evaluation"];

export function RecordGraph() {
  const t = useTranslations("common.hypercerts.graph");
  const [selected, setSelected] = useState<NodeId | null>(null);

  // Literal keys so the static i18n checker can verify every message exists.
  const roles: Record<NodeId, string> = {
    collection: t("roles.collection"),
    activity: t("roles.activity"),
    attachment: t("roles.attachment"),
    location: t("roles.location"),
    rights: t("roles.rights"),
    tag: t("roles.tag"),
    receipt: t("roles.receipt"),
    evaluation: t("roles.evaluation"),
  };
  const links: Record<LinkId, string> = {
    items: t("links.items"),
    locations: t("links.locations"),
    rights: t("links.rights"),
    usedTags: t("links.usedTags"),
    subjects: t("links.subjects"),
    for: t("links.for"),
    subject: t("links.subject"),
  };
  const support: Record<Support, string> = {
    both: t("bothApps"),
    gainforest: t("gainforestOnly"),
    maearth: t("maearthOnly"),
  };

  const active = selected ? NODES[selected] : null;

  return (
    <div>
      {/* Below ~600px the NSID labels stop being legible when the diagram is
          scaled to fit, so the graph gets its own horizontal scroll instead. */}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <svg
        viewBox="0 0 760 490"
        className="mx-auto block w-full"
        style={{ maxWidth: 660, minWidth: 560 }}
        role="img"
        aria-label={t("ariaLabel")}
      >
        <defs>
          <marker id="hc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--primary)" />
          </marker>
          <marker id="hc-arrow-faint" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--border)" />
          </marker>
        </defs>

        {EDGES.map((edge) => {
          const lit = !selected || edge.from === selected || edge.to === selected;
          return (
            <g key={edge.id} opacity={lit ? 1 : 0.28}>
              <path
                d={edge.d}
                fill="none"
                stroke={lit ? "var(--primary)" : "var(--border)"}
                strokeWidth={lit ? 1.3 : 1}
                strokeDasharray={edge.dashed ? "4 4" : undefined}
                markerEnd={lit ? "url(#hc-arrow)" : "url(#hc-arrow-faint)"}
              />
              <text
                x={edge.labelX}
                y={edge.labelY}
                textAnchor={edge.anchor}
                fontSize="10.5"
                className="font-mono"
                fill={lit ? "var(--primary)" : "var(--muted-foreground)"}
              >
                {edge.label}
              </text>
            </g>
          );
        })}

        {ORDER.map((id) => {
          const node = NODES[id];
          const isSelected = selected === id;
          const dim = Boolean(selected) && !isSelected;
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={node.nsid}
              className="cursor-pointer outline-none"
              onClick={() => setSelected(isSelected ? null : id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(isSelected ? null : id);
                }
              }}
              opacity={dim ? 0.4 : 1}
            >
              <rect
                x={node.x - 80}
                y={node.y - 22}
                width={160}
                height={44}
                rx={10}
                fill={isSelected ? "var(--primary)" : "var(--background)"}
                stroke={isSelected ? "var(--primary)" : "var(--border)"}
                strokeWidth={isSelected ? 1.6 : 1}
              />
              <text
                x={node.x}
                y={node.y - 4}
                textAnchor="middle"
                fontSize="9"
                className="font-mono"
                fill={isSelected ? "var(--background)" : "var(--muted-foreground)"}
                opacity={isSelected ? 0.75 : 1}
              >
                {node.prefix}
              </text>
              <text
                x={node.x}
                y={node.y + 12}
                textAnchor="middle"
                fontSize="14"
                className="font-mono"
                fill={isSelected ? "var(--background)" : "var(--foreground)"}
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>
      </div>

      <div className="mx-auto mt-4 min-h-[9.5rem] max-w-xl sm:min-h-[8rem]">
        <AnimatePresence mode="wait" initial={false}>
          {active ? (
            <motion.div
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="rounded-xl border border-border/60 px-5 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[12.5px] text-primary [overflow-wrap:anywhere]">{active.nsid}</code>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
                    active.support === "both"
                      ? "border-primary/40 text-primary"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {support[active.support]}
                </span>
              </div>
              <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                <RichText text={roles[selected as NodeId]} />
              </p>
              <p className="m-0 mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground/80">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                  {t("attachedVia")}
                </span>{" "}
                <RichText text={links[active.link]} />
              </p>
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="m-0 text-center text-[13px] text-muted-foreground/60"
            >
              {t("hint")}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
