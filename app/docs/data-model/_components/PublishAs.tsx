"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Owner = "personal" | "organization";

// Example handles used to show what the stored address looks like. They are
// sample identifiers rather than UI copy, so they stay untranslated.
const REPO: Record<Owner, string> = {
  personal: "maria.gainforest.app",
  organization: "tanjung-collective.gainforest.app",
};

const ROLES = ["member", "admin", "owner"] as const;

/**
 * The "who does this belong to?" toy. Flip between publishing as yourself and
 * publishing as an organization, and watch the only thing that actually
 * changes: the account the records are written into.
 */
export function PublishAs() {
  const t = useTranslations("common.dataModel.publishAs");
  const [owner, setOwner] = useState<Owner>("personal");

  // Literal keys so the static i18n checker can verify every message exists.
  const optionLabels: Record<Owner, string> = {
    personal: t("option.personal"),
    organization: t("option.organization"),
  };
  const summaries: Record<Owner, string> = {
    personal: t("summary.personal"),
    organization: t("summary.organization"),
  };
  const guards: Record<Owner, string> = {
    personal: t("guard.personal"),
    organization: t("guard.organization"),
  };
  const roleLabels: Record<(typeof ROLES)[number], string> = {
    member: t("roles.member.name"),
    admin: t("roles.admin.name"),
    owner: t("roles.owner.name"),
  };
  const roleTexts: Record<(typeof ROLES)[number], string> = {
    member: t("roles.member.text"),
    admin: t("roles.admin.text"),
    owner: t("roles.owner.text"),
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
        {t("publishingAs")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["personal", "organization"] as Owner[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={owner === option}
            onClick={() => setOwner(option)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              owner === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {optionLabels[option]}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-muted/25 px-5 py-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
          {t("storedAt")}
        </div>
        <div className="mt-1.5 overflow-x-auto">
          <code className="whitespace-nowrap font-mono text-[12.5px] text-muted-foreground">
            at://
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={owner}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="font-semibold text-primary"
              >
                {REPO[owner]}
              </motion.span>
            </AnimatePresence>
            /app.gainforest.dwc.occurrence/3lk2f9x
          </code>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={owner}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="mt-3.5 border-t border-border/50 pt-3.5"
          >
            <p className="m-0 text-[13.5px] leading-relaxed text-foreground/85">{summaries[owner]}</p>
            <p className="m-0 mt-2 text-[13px] leading-relaxed text-muted-foreground">{guards[owner]}</p>

            {owner === "organization" && (
              <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
                {ROLES.map((role) => (
                  <li key={role} className="flex items-baseline gap-2.5 text-[12.5px] leading-relaxed">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-primary">{roleLabels[role]}</span>
                    <span className="text-muted-foreground">{roleTexts[role]}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-border/60 px-4 py-3">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground">{t("note")}</p>
      </div>
    </div>
  );
}
