"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftIcon, ArrowRightIcon, PauseIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";

type StepKey = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";

// What each step puts in the repo. `writes` is the record minted at that step;
// `consumes` are the strong refs it must already hold. `rewrites` marks the
// step where an existing record is re-put because a child's CID moved.
// Identifiers stay verbatim in every locale.
const STEPS: {
  key: StepKey;
  writes: string;
  consumes?: string[];
  rewrites?: string;
  ephemeral?: boolean;
}[] = [
  { key: "s1", writes: "blob", ephemeral: true },
  { key: "s2", writes: "app.certified.location" },
  { key: "s3", writes: "org.hypercerts.workscope.tag" },
  {
    key: "s4",
    writes: "org.hypercerts.claim.activity",
    consumes: ["locations[]", "workScope.usedTags[]", "rights"],
  },
  { key: "s5", writes: "org.hypercerts.collection", consumes: ["items[]"] },
  { key: "s6", writes: "org.hypercerts.context.attachment", consumes: ["subjects[]"] },
  { key: "s7", writes: "org.hypercerts.collection", rewrites: "org.hypercerts.collection" },
  { key: "s8", writes: "org.hypercerts.funding.receipt", consumes: ["for"] },
];

const PLAY_INTERVAL_MS = 4200;

// A step-through of one full project publish. The right column is a toy repo:
// records land in write order, and step 7 shows the parent being re-put after
// the child it references changed CID.
export function PublishSequence() {
  const t = useTranslations("common.hypercerts.sequence");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = STEPS.length;

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

  // Literal keys so the static i18n checker can verify every message exists.
  const copy: Record<StepKey, { title: string; text: string }> = {
    s1: { title: t("steps.s1.title"), text: t("steps.s1.text") },
    s2: { title: t("steps.s2.title"), text: t("steps.s2.text") },
    s3: { title: t("steps.s3.title"), text: t("steps.s3.text") },
    s4: { title: t("steps.s4.title"), text: t("steps.s4.text") },
    s5: { title: t("steps.s5.title"), text: t("steps.s5.text") },
    s6: { title: t("steps.s6.title"), text: t("steps.s6.text") },
    s7: { title: t("steps.s7.title"), text: t("steps.s7.text") },
    s8: { title: t("steps.s8.title"), text: t("steps.s8.text") },
  };

  const current = STEPS[step];
  // Records written so far, de-duplicated: a re-put updates the existing chip
  // rather than adding a second one.
  const written: { nsid: string; ephemeral?: boolean }[] = [];
  for (const entry of STEPS.slice(0, step + 1)) {
    if (entry.rewrites) continue;
    if (written.some((item) => item.nsid === entry.writes)) continue;
    written.push({ nsid: entry.writes, ephemeral: entry.ephemeral });
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-border/60 px-5 py-4">
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
            {t("stepLabel", { n: step + 1, total })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <div className="text-[15px] font-medium text-foreground">{copy[current.key].title}</div>
              <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                <RichText text={copy[current.key].text} />
              </p>
              {current.consumes && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.consumes.map((field) => (
                    <span
                      key={field}
                      className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[10.5px] text-primary"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="rounded-xl border border-border/60 px-5 py-4">
          <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
            {t("repoLabel")}
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            <AnimatePresence initial={false}>
              {written.map((record) => {
                const isCurrent = record.nsid === current.writes;
                const isRewrite = Boolean(current.rewrites) && record.nsid === current.rewrites;
                return (
                  <motion.li
                    key={record.nsid}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5",
                      isCurrent ? "border-primary/50 bg-primary/5" : "border-border/60",
                    )}
                  >
                    <code
                      className={cn(
                        "font-mono text-[11px] [overflow-wrap:anywhere]",
                        isCurrent ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {record.nsid}
                    </code>
                    {isRewrite ? (
                      <RefreshCwIcon className="h-3 w-3 shrink-0 text-primary" />
                    ) : (
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/50">
                        {record.ephemeral ? "ref" : "uri · cid"}
                      </span>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {written.length === 0 && <li className="text-[12.5px] text-muted-foreground/60">{t("empty")}</li>}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-5 flex max-w-xl items-center justify-between gap-3">
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
            {STEPS.map((entry, index) => (
              <button
                key={entry.key}
                type="button"
                aria-label={t("stepLabel", { n: index + 1, total })}
                aria-current={index === step ? "step" : undefined}
                onClick={() => {
                  setPlaying(false);
                  setStep(index);
                }}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === step ? "w-5 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/40",
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
