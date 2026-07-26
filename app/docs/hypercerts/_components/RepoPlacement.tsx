"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";

type AppId = "gainforest" | "maearth" | "advice";
type RowId = "project" | "attachment" | "tag" | "rights" | "receipt" | "snapshot";
type RepoKind = "personalOrGroup" | "group" | "platform" | "facilitator" | "none";

const APPS: AppId[] = ["gainforest", "maearth", "advice"];
const ROWS: RowId[] = ["project", "attachment", "tag", "rights", "receipt", "snapshot"];

// Record identifiers per row — verbatim in every locale.
const ROW_NSIDS: Record<RowId, string> = {
  project: "org.hypercerts.collection + claim.activity",
  attachment: "org.hypercerts.context.attachment",
  tag: "org.hypercerts.workscope.tag",
  rights: "org.hypercerts.claim.rights",
  receipt: "org.hypercerts.funding.receipt",
  snapshot: "org.hypercerts.collection (type: snapshot)",
};

// Which account each record lands in, per app.
const PLACEMENT: Record<RowId, Record<AppId, RepoKind>> = {
  project: { gainforest: "personalOrGroup", maearth: "group", advice: "personalOrGroup" },
  attachment: { gainforest: "personalOrGroup", maearth: "group", advice: "personalOrGroup" },
  tag: { gainforest: "personalOrGroup", maearth: "platform", advice: "platform" },
  rights: { gainforest: "none", maearth: "platform", advice: "platform" },
  receipt: { gainforest: "facilitator", maearth: "none", advice: "facilitator" },
  snapshot: { gainforest: "none", maearth: "platform", advice: "platform" },
};

const KIND_STYLES: Record<RepoKind, string> = {
  personalOrGroup: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  group: "border-sky-500/40 text-sky-700 dark:text-sky-400",
  platform: "border-violet-500/40 text-violet-700 dark:text-violet-400",
  facilitator: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  none: "border-border text-muted-foreground/60",
};

// Switch app and watch where each record lands. The four repo kinds are the
// whole design space: the schemas never say which account should hold what.
export function RepoPlacement() {
  const t = useTranslations("common.hypercerts.repos");
  const [app, setApp] = useState<AppId>("advice");

  // Literal keys so the static i18n checker can verify every message exists.
  const appLabels: Record<AppId, string> = {
    gainforest: t("apps.gainforest"),
    maearth: t("apps.maearth"),
    advice: t("apps.advice"),
  };
  const kindLabels: Record<RepoKind, string> = {
    personalOrGroup: t("kinds.personalOrGroup"),
    group: t("kinds.group"),
    platform: t("kinds.platform"),
    facilitator: t("kinds.facilitator"),
    none: t("kinds.none"),
  };
  const kindNotes: Record<Exclude<RepoKind, "none">, string> = {
    personalOrGroup: t("kindNotes.personalOrGroup"),
    group: t("kindNotes.group"),
    platform: t("kindNotes.platform"),
    facilitator: t("kindNotes.facilitator"),
  };
  const rowLabels: Record<RowId, string> = {
    project: t("rowLabels.project"),
    attachment: t("rowLabels.attachment"),
    tag: t("rowLabels.tag"),
    rights: t("rowLabels.rights"),
    receipt: t("rowLabels.receipt"),
    snapshot: t("rowLabels.snapshot"),
  };
  const notes: Record<RowId, Record<AppId, string>> = {
    project: {
      gainforest: t("rows.project.gainforest"),
      maearth: t("rows.project.maearth"),
      advice: t("rows.project.advice"),
    },
    attachment: {
      gainforest: t("rows.attachment.gainforest"),
      maearth: t("rows.attachment.maearth"),
      advice: t("rows.attachment.advice"),
    },
    tag: {
      gainforest: t("rows.tag.gainforest"),
      maearth: t("rows.tag.maearth"),
      advice: t("rows.tag.advice"),
    },
    rights: {
      gainforest: t("rows.rights.gainforest"),
      maearth: t("rows.rights.maearth"),
      advice: t("rows.rights.advice"),
    },
    receipt: {
      gainforest: t("rows.receipt.gainforest"),
      maearth: t("rows.receipt.maearth"),
      advice: t("rows.receipt.advice"),
    },
    snapshot: {
      gainforest: t("rows.snapshot.gainforest"),
      maearth: t("rows.snapshot.maearth"),
      advice: t("rows.snapshot.advice"),
    },
  };

  const usedKinds = Array.from(
    new Set(ROWS.map((row) => PLACEMENT[row][app]).filter((kind): kind is Exclude<RepoKind, "none"> => kind !== "none")),
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {APPS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setApp(id)}
            aria-pressed={app === id}
            className={cn(
              "rounded-full border px-3.5 py-1 text-[12.5px] transition-colors",
              app === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {appLabels[id]}
          </button>
        ))}
      </div>

      <ul className="m-0 mt-5 list-none border-t border-border/60 p-0">
        {ROWS.map((row) => {
          const kind = PLACEMENT[row][app];
          return (
            <li key={row} className="border-b border-border/60 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
                <div className="sm:w-56 sm:shrink-0">
                  <div className="text-[13.5px] font-medium text-foreground">{rowLabels[row]}</div>
                  <code className="font-mono text-[10.5px] text-muted-foreground/70 [overflow-wrap:anywhere]">
                    {ROW_NSIDS[row]}
                  </code>
                </div>
                <div className="min-w-0 flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`${app}-${row}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                          KIND_STYLES[kind],
                        )}
                      >
                        {kindLabels[kind]}
                      </span>
                      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                        <RichText text={notes[row][app]} />
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {usedKinds.map((kind) => (
          <div key={kind} className="rounded-lg border border-border/60 px-3.5 py-2.5">
            <span
              className={cn(
                "inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                KIND_STYLES[kind],
              )}
            >
              {kindLabels[kind]}
            </span>
            <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{kindNotes[kind]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
