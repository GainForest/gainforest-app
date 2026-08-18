"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, FolderIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Credible exit as a toy: Maria's name and data live in a suitcase that can
// move between two hosts with one tap. Nothing in the suitcase changes, which
// is the whole point. The did string is an illustrative technical identifier.
export function MoveHouse() {
  const t = useTranslations("common.atproto.move");
  const [atB, setAtB] = useState(false);
  const [moves, setMoves] = useState(0);

  const checklist = [t("checkName"), t("checkRecords"), t("checkFollowers"), t("checkLinks")];

  return (
    <div className="mx-auto max-w-xl">
      {/* the identity, fixed above the hosts because it belongs to no host */}
      <div className="mx-auto flex w-fit max-w-full items-center gap-2.5 rounded-xl border border-primary/40 px-4 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[13px] font-semibold text-primary">
          M
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-foreground">maria.example</div>
          <div className="truncate font-mono text-[10.5px] text-muted-foreground">did:plc:44ybard66vv7wtc2r6zk</div>
        </div>
      </div>
      <div className="mx-auto h-5 w-px bg-border" />

      <div className="grid grid-cols-2 gap-4">
        {([false, true] as const).map((isB) => {
          const active = atB === isB;
          return (
            <div
              key={String(isB)}
              className={cn(
                "flex min-h-[8.5rem] flex-col rounded-xl border px-4 py-3 transition-colors",
                active ? "border-primary/60" : "border-dashed border-border/70",
              )}
            >
              <div
                className={cn(
                  "font-mono text-[11px]",
                  active ? "text-foreground" : "text-muted-foreground/60",
                )}
              >
                {isB ? t("hostB") : t("hostA")}
              </div>
              <div className="mt-2 flex flex-1 items-center justify-center">
                {active && (
                  <motion.div
                    layoutId="suitcase"
                    transition={{ type: "spring", stiffness: 90, damping: 16 }}
                    className="w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {t("suitcaseRecords")}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-foreground">
                      <UsersIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {t("suitcaseFollowers")}
                    </div>
                  </motion.div>
                )}
                {!active && <span className="text-[11.5px] text-muted-foreground/50">{t("emptyHost")}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={() => {
            setAtB((v) => !v);
            setMoves((n) => n + 1);
          }}
          className="rounded-full border border-primary bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {atB ? t("moveBack") : t("moveAction")}
        </button>

        <AnimatePresence>
          {moves > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="m-0 mt-4 grid list-none grid-cols-2 gap-x-6 gap-y-1.5 p-0"
            >
              {checklist.map((item, i) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.15 }}
                  className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
                >
                  <CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {item}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <p className="m-0 mt-4 max-w-md text-center text-[12.5px] leading-relaxed text-muted-foreground/80">
          {t("caption")}
        </p>
      </div>
    </div>
  );
}
