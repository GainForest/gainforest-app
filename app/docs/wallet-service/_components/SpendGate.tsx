"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CheckCircle2Icon, FingerprintIcon, ServerIcon, ShieldXIcon } from "lucide-react";

type Attempt = "other" | "passkey";

// Only a passkey on the wallet's list can approve a payment. The record on
// the account is public and holds public keys only, so a server, GainForest,
// or a stranger reading it gains nothing.
export function SpendGate() {
  const t = useTranslations("common.walletService.gate");
  const [attempt, setAttempt] = useState<Attempt>("other");

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAttempt("other")}
          aria-pressed={attempt === "other"}
          className={`rounded-xl border px-3 py-3 text-[12.5px] font-medium transition-colors ${
            attempt === "other"
              ? "border-destructive/40 bg-destructive/5 text-foreground"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          {t("otherAttempt")}
        </button>
        <button
          type="button"
          onClick={() => setAttempt("passkey")}
          aria-pressed={attempt === "passkey"}
          className={`rounded-xl border px-3 py-3 text-[12.5px] font-medium transition-colors ${
            attempt === "passkey"
              ? "border-primary/40 bg-primary/5 text-foreground"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          {t("passkeyAttempt")}
        </button>
      </div>

      <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 sm:gap-4">
        <GateNode
          icon={
            attempt === "passkey" ? (
              <FingerprintIcon className="h-5 w-5" />
            ) : (
              <ServerIcon className="h-5 w-5" />
            )
          }
          label={attempt === "passkey" ? t("passkeyNode") : t("otherNode")}
          active
        />

        <FlowLine active={attempt === "passkey"} denied={attempt === "other"} />

        <GateNode
          icon={attempt === "passkey" ? <CheckCircle2Icon className="h-5 w-5" /> : <ShieldXIcon className="h-5 w-5" />}
          label={t("walletNode")}
          active={attempt === "passkey"}
          denied={attempt === "other"}
        />
      </div>

      <motion.div
        key={attempt}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`mx-auto mt-6 max-w-xl rounded-xl border px-5 py-4 text-center ${
          attempt === "passkey" ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
        }`}
      >
        <div
          className={`mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] ${
            attempt === "passkey" ? "text-primary" : "text-destructive"
          }`}
        >
          {attempt === "passkey" ? t("approved") : t("denied")}
        </div>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          {attempt === "passkey" ? t("approvedDesc") : t("deniedDesc")}
        </p>
      </motion.div>
    </div>
  );
}

function GateNode({
  icon,
  label,
  active,
  denied = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  denied?: boolean;
}) {
  return (
    <motion.div
      layout
      className={`flex min-h-28 w-32 shrink-0 flex-col items-center justify-center rounded-2xl border px-3 text-center sm:w-44 ${
        denied
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : active
            ? "border-primary/40 bg-background text-primary"
            : "border-border bg-background text-muted-foreground"
      }`}
    >
      <span className="mb-2">{icon}</span>
      <span className="font-mono text-[11px] leading-tight">{label}</span>
    </motion.div>
  );
}

function FlowLine({ active, denied }: { active: boolean; denied: boolean }) {
  return (
    <div className={`relative h-px min-w-8 flex-1 ${denied ? "bg-destructive/40" : "bg-primary/40"}`} aria-hidden="true">
      {active && (
        <motion.span
          initial={{ left: 0 }}
          animate={{ left: "calc(100% - 8px)" }}
          transition={{ duration: 1, repeat: Infinity, repeatDelay: 0.45 }}
          className="absolute -top-[3px] h-2 w-2 rounded-full bg-primary"
        />
      )}
      {denied && (
        <span className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-background px-1 text-sm font-bold text-destructive">
          ×
        </span>
      )}
    </div>
  );
}
