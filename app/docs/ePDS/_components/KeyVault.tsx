"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { FileTextIcon, KeyRoundIcon, LockIcon, PenLineIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "idle" | "signing" | "signed" | "denied";

// A tiny theater piece about the TEE signer: records go into the safe and
// signatures come out, but the key itself never leaves. Trying to grab the
// key just makes the safe shake its head.
export function KeyVault() {
  const t = useTranslations("common.epds.vault");
  const [phase, setPhase] = useState<Phase>("idle");
  const [shakeCount, setShakeCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function sign() {
    if (phase === "signing") return;
    setPhase("signing");
    timer.current = setTimeout(() => setPhase("signed"), 1300);
  }

  function steal() {
    if (phase === "signing") return;
    setPhase("denied");
    setShakeCount((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
        {/* record flying in from the left */}
        <AnimatePresence>
          {phase === "signing" && (
            <motion.div
              key="record"
              initial={{ x: -150, opacity: 0 }}
              animate={{ x: -8, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.1, times: [0, 0.2, 0.8, 1] }}
              exit={{ opacity: 0 }}
              className="absolute text-muted-foreground"
            >
              <FileTextIcon className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* the safe */}
        <motion.div
          key={shakeCount}
          animate={phase === "denied" ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary/50 bg-background shadow-sm"
        >
          <LockIcon className="absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-background p-0.5 text-primary" />
          <motion.div
            animate={
              phase === "signing"
                ? { rotate: [0, -14, 14, -8, 8, 0], scale: [1, 1.12, 1] }
                : phase === "denied"
                  ? { rotate: [0, -10, 10, 0] }
                  : { rotate: 0, scale: 1 }
            }
            transition={{ duration: 0.7 }}
          >
            <KeyRoundIcon className="h-8 w-8 text-primary" />
          </motion.div>
        </motion.div>

        {/* signature flying out to the right */}
        <AnimatePresence>
          {phase === "signed" && (
            <motion.div
              key="signature"
              initial={{ x: 8, opacity: 0, scale: 0.7 }}
              animate={{ x: 130, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 14 }}
              exit={{ opacity: 0 }}
              className="absolute z-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <PenLineIcon className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          onClick={sign}
          disabled={phase === "signing"}
          className={cn(
            "rounded-full bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
            phase === "signing" && "opacity-50",
          )}
        >
          {t("signButton")}
        </button>
        <button
          type="button"
          onClick={steal}
          disabled={phase === "signing"}
          className="rounded-full border border-border/70 px-4 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("stealButton")}
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${phase}-${shakeCount}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-3 min-h-[2.5rem] text-center text-[13px] leading-relaxed text-muted-foreground"
        >
          {phase === "idle" && t("idle")}
          {phase === "signing" && t("signing")}
          {phase === "signed" && t("signed")}
          {phase === "denied" && t("denied")}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
