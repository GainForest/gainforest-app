"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { AppWindowIcon, CheckIcon, CpuIcon, PauseIcon, PlayIcon, ServerIcon } from "lucide-react";

type Step = 0 | 1 | 2 | 3;

const STEP_COUNT = 4;

// A step-through graph for one normal AT Protocol write. The TEE is only a
// signing stop. Records still follow the ordinary PDS path.
export function SigningJourney() {
  const t = useTranslations("common.teeEpds.journey");
  const [step, setStep] = useState<Step>(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current === STEP_COUNT - 1) {
          setPlaying(false);
          return current;
        }
        return (current + 1) as Step;
      });
    }, 1700);
    return () => window.clearInterval(timer);
  }, [playing]);

  const labels = [t("nodes.app"), t("nodes.pds"), t("nodes.tee"), t("nodes.network")];
  const icons = [
    <AppWindowIcon key="app" className="h-4 w-4" />,
    <ServerIcon key="pds" className="h-4 w-4" />,
    <CpuIcon key="tee" className="h-4 w-4" />,
    <CheckIcon key="network" className="h-4 w-4" />,
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="relative grid grid-cols-4 gap-2">
        <div className="absolute top-6 right-[12.5%] left-[12.5%] h-px bg-border" aria-hidden="true" />
        <motion.div
          className="absolute top-6 left-[12.5%] h-px bg-primary"
          animate={{ width: `${(step / 3) * 75}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          aria-hidden="true"
        />

        {labels.map((label, index) => {
          const active = index <= step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(index as Step);
              }}
              className="relative z-10 flex min-w-0 flex-col items-center gap-2 bg-transparent"
              aria-label={t("jumpTo", { step: index + 1 })}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
                  active
                    ? index === 2
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary bg-background text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {icons[index]}
              </span>
              <span className={`text-center font-mono text-[10px] leading-tight ${active ? "text-foreground" : "text-muted-foreground/60"}`}>
                {label}
              </span>
            </button>
          );
        })}

        <motion.span
          key={step}
          initial={{ left: "12.5%", opacity: 0 }}
          animate={{ left: `${12.5 + step * 25}%`, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute top-[21px] z-20 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background"
          aria-hidden="true"
        />
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="mx-auto mt-7 min-h-28 max-w-xl rounded-xl border border-border/60 bg-background px-5 py-4 text-center"
      >
        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-primary">
          {t("stepLabel", { n: step + 1, total: STEP_COUNT })}
        </div>
        <h3 className="m-0 text-sm font-medium text-foreground">
          {step === 0 && t("steps.s1.title")}
          {step === 1 && t("steps.s2.title")}
          {step === 2 && t("steps.s3.title")}
          {step === 3 && t("steps.s4.title")}
        </h3>
        <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {step === 0 && t("steps.s1.text")}
          {step === 1 && t("steps.s2.text")}
          {step === 2 && t("steps.s3.text")}
          {step === 3 && t("steps.s4.text")}
        </p>
      </motion.div>

      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (step === STEP_COUNT - 1) setStep(0);
            setPlaying((value) => !value);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground"
        >
          {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
          {playing ? t("pause") : t("play")}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep((value) => Math.max(0, value - 1) as Step);
          }}
          disabled={step === 0}
          className="rounded-lg border border-border bg-background px-3.5 py-2 text-[12px] text-muted-foreground disabled:opacity-40"
        >
          {t("back")}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setStep((value) => Math.min(STEP_COUNT - 1, value + 1) as Step);
          }}
          disabled={step === STEP_COUNT - 1}
          className="rounded-lg border border-border bg-background px-3.5 py-2 text-[12px] text-muted-foreground disabled:opacity-40"
        >
          {t("next")}
        </button>
      </div>
    </div>
  );
}
