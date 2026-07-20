"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { FileTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PersonId = "ana" | "ben" | "cai";

// Three fictional teammates with distinct colors so their author stamps are
// easy to tell apart inside the shared repo. Names are not UI copy.
const PEOPLE: {
  id: PersonId;
  name: string;
  avatar: string;
  chip: string;
}[] = [
  {
    id: "ana",
    name: "Ana",
    avatar: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40",
    chip: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  },
  {
    id: "ben",
    name: "Ben",
    avatar: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/40",
    chip: "border-sky-500/40 text-sky-700 dark:text-sky-400",
  },
  {
    id: "cai",
    name: "Cai",
    avatar: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40",
    chip: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  },
];

const MAX_RECORDS = 9;

// A tiny toy repo: tap a teammate and they drop a record into the shared box.
// Every record chip keeps the author's color and name, which is exactly the
// authorship memory the group service maintains for real records.
export function SharedRepo() {
  const t = useTranslations("common.cgs.repo");
  const [records, setRecords] = useState<{ id: number; person: PersonId }[]>([]);
  const [nextId, setNextId] = useState(1);

  // Literal keys so the static i18n checker can verify every message exists.
  const roleLabels: Record<PersonId, string> = {
    ana: t("roleOwner"),
    ben: t("roleAdmin"),
    cai: t("roleMember"),
  };

  function publish(person: PersonId) {
    setRecords((current) => [...current, { id: nextId, person }].slice(-MAX_RECORDS));
    setNextId((n) => n + 1);
  }

  const byId = Object.fromEntries(PEOPLE.map((p) => [p.id, p])) as Record<PersonId, (typeof PEOPLE)[number]>;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex justify-center gap-3 sm:gap-5">
        {PEOPLE.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => publish(person.id)}
            className="group flex w-24 flex-col items-center gap-1.5 rounded-xl border border-transparent px-2 py-3 transition-colors hover:border-border/60 hover:bg-muted/40"
          >
            <span
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full border text-[15px] font-semibold transition-transform group-hover:scale-105 group-active:scale-95",
                person.avatar,
              )}
            >
              {person.name[0]}
            </span>
            <span className="text-[13px] font-medium text-foreground">{person.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
              {roleLabels[person.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
            {t("repoLabel")}
          </span>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => setRecords([])}
              className="text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("clear")}
            </button>
          )}
        </div>

        <div className="flex min-h-[7rem] flex-wrap content-start items-start gap-2">
          {records.length === 0 && (
            <p className="m-0 w-full py-8 text-center text-[13px] text-muted-foreground/70">{t("empty")}</p>
          )}
          <AnimatePresence initial={false}>
            {records.map((record) => (
              <motion.div
                key={record.id}
                layout
                initial={{ opacity: 0, y: -14, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 font-mono text-[11px]",
                  byId[record.person].chip,
                )}
              >
                <FileTextIcon className="h-3.5 w-3.5" />
                {t("stamp", { name: byId[record.person].name })}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-4 text-center text-[13px] leading-relaxed text-muted-foreground">{t("caption")}</p>
    </div>
  );
}
