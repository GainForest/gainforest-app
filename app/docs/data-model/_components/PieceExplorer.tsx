"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  BuildingIcon,
  CameraIcon,
  FolderIcon,
  LeafIcon,
  MapPinIcon,
  SproutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PieceId = "observation" | "evidence" | "dataset" | "site" | "project" | "organization";

const PIECES: PieceId[] = ["observation", "evidence", "dataset", "site", "project", "organization"];

// The record type behind each piece. Protocol identifiers, so untranslated on purpose.
const RECORD_TYPE: Record<PieceId, string> = {
  observation: "app.gainforest.dwc.occurrence",
  evidence: "app.gainforest.ac.multimedia",
  dataset: "app.gainforest.dwc.dataset",
  site: "app.certified.location",
  project: "org.hypercerts.collection",
  organization: "app.certified.actor.organization",
};

const ICONS: Record<PieceId, React.ReactNode> = {
  observation: <LeafIcon className="h-4 w-4" />,
  evidence: <CameraIcon className="h-4 w-4" />,
  dataset: <FolderIcon className="h-4 w-4" />,
  site: <MapPinIcon className="h-4 w-4" />,
  project: <SproutIcon className="h-4 w-4" />,
  organization: <BuildingIcon className="h-4 w-4" />,
};

// A tour of the six things a steward actually handles. Pick one and read what
// it is in plain language, what it is called under the hood, and how it hooks
// onto its neighbours.
export function PieceExplorer() {
  const t = useTranslations("common.dataModel.pieces");
  const [selected, setSelected] = useState<PieceId>("observation");

  // Literal keys so the static i18n checker can verify every message exists.
  const names: Record<PieceId, string> = {
    observation: t("observation.name"),
    evidence: t("evidence.name"),
    dataset: t("dataset.name"),
    site: t("site.name"),
    project: t("project.name"),
    organization: t("organization.name"),
  };
  const plain: Record<PieceId, string> = {
    observation: t("observation.plain"),
    evidence: t("evidence.plain"),
    dataset: t("dataset.plain"),
    site: t("site.plain"),
    project: t("project.plain"),
    organization: t("organization.plain"),
  };
  const detail: Record<PieceId, string> = {
    observation: t("observation.detail"),
    evidence: t("evidence.detail"),
    dataset: t("dataset.detail"),
    site: t("site.detail"),
    project: t("project.detail"),
    organization: t("organization.detail"),
  };
  const hooks: Record<PieceId, string> = {
    observation: t("observation.hooks"),
    evidence: t("evidence.hooks"),
    dataset: t("dataset.hooks"),
    site: t("site.hooks"),
    project: t("project.hooks"),
    organization: t("organization.hooks"),
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PIECES.map((piece) => {
          const active = selected === piece;
          return (
            <button
              key={piece}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(piece)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-medium leading-snug transition-colors",
                active
                  ? "border-primary bg-primary/8 text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className={active ? "text-primary" : "text-muted-foreground/70"}>{ICONS[piece]}</span>
              {names[piece]}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mt-4 rounded-2xl border border-border/60 bg-muted/25 px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold text-foreground">{names[selected]}</span>
            <span className="font-mono text-[10.5px] text-muted-foreground/70">{RECORD_TYPE[selected]}</span>
          </div>
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-foreground/85">{plain[selected]}</p>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted-foreground">{detail[selected]}</p>
          <div className="mt-3 border-t border-border/50 pt-3">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
              {t("hooksLabel")}
            </div>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">{hooks[selected]}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
