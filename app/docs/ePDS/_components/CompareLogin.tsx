"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, KeyRoundIcon, LockIcon, MailIcon, RotateCcwIcon, TicketIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "classic" | "epds";
type EpdsStage = "email" | "code" | "done";

const CODE = "48291736";

// A playful side-by-side of the two login experiences. The classic card is a
// static wall of fields; the ePDS card actually walks through email → code →
// done with a small auto-typing animation.
export function CompareLogin() {
  const t = useTranslations("common.epds.compare");
  const [mode, setMode] = useState<Mode>("epds");
  const [stage, setStage] = useState<EpdsStage>("email");
  const [typed, setTyped] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear pending animation timers when the demo is reset or unmounted.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function sendCode() {
    setStage("code");
    setTyped(0);
    CODE.split("").forEach((_, i) => {
      timers.current.push(setTimeout(() => setTyped(i + 1), 350 + i * 130));
    });
    timers.current.push(setTimeout(() => setStage("done"), 350 + CODE.length * 130 + 650));
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStage("email");
    setTyped(0);
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "classic", label: t("classicTab") },
    { id: "epds", label: t("epdsTab") },
  ];

  return (
    <div>
      <div className="mb-5 flex justify-center">
        <div className="inline-flex rounded-full border border-border/70 p-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              onClick={() => {
                setMode(tab.id);
                if (tab.id === "epds") reset();
              }}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-[13px] transition-colors",
                mode === tab.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === tab.id && (
                <motion.span
                  layoutId="compare-tab"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-sm">
        <div className="rounded-2xl border border-border/70 bg-background p-6 shadow-sm">
          <AnimatePresence mode="wait" initial={false}>
            {mode === "classic" ? (
              <motion.div
                key="classic"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex min-h-[240px] flex-col gap-3"
              >
                <FakeField icon={<KeyRoundIcon className="h-3.5 w-3.5" />} label={t("handle")} value="alice.pds.example.com" />
                <FakeField icon={<LockIcon className="h-3.5 w-3.5" />} label={t("password")} value="••••••••••••" />
                <FakeField icon={<TicketIcon className="h-3.5 w-3.5" />} label={t("inviteCode")} value="pds-example-com-a1b2c" />
                <div className="mt-1 rounded-lg bg-muted px-4 py-2 text-center text-[13px] font-medium text-muted-foreground">
                  {t("signIn")}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="epds"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex min-h-[240px] flex-col justify-center gap-3"
              >
                {stage === "email" && (
                  <>
                    <FakeField icon={<MailIcon className="h-3.5 w-3.5" />} label={t("email")} value="alice@example.com" />
                    <button
                      type="button"
                      onClick={sendCode}
                      className="mt-1 rounded-lg bg-primary px-4 py-2 text-center text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      {t("sendCode")}
                    </button>
                  </>
                )}

                {stage === "code" && (
                  <div className="text-center">
                    <div className="mb-3 flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground">
                      <MailIcon className="h-3.5 w-3.5 text-primary" />
                      {t("codeLabel")}
                    </div>
                    <div className="flex justify-center gap-1.5">
                      {CODE.split("").map((digit, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex h-9 w-7 items-center justify-center rounded-md border font-mono text-sm transition-colors",
                            i < typed ? "border-primary/60 text-foreground" : "border-border/70 text-transparent",
                          )}
                        >
                          {i < typed && (
                            <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                              {digit}
                            </motion.span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {stage === "done" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 text-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    >
                      <CheckIcon className="h-6 w-6" />
                    </motion.div>
                    <div className="text-[15px] font-medium text-foreground">{t("done")}</div>
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                      {t("reset")}
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 min-h-[3.5rem] text-center text-[13px] leading-relaxed text-muted-foreground"
          >
            {mode === "classic" ? t("classicCaption") : t("epdsCaption")}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function FakeField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
        {icon}
        {label}
      </div>
      <div className="font-mono text-[12.5px] text-foreground/80">{value}</div>
    </div>
  );
}
