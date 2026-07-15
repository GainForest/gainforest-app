"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { KeyRoundIcon, ServerIcon, ShieldCheckIcon } from "lucide-react";

type Mode = "server" | "tee";

// Compares a key stored by an ordinary server with a key that stays inside
// protected TEE memory. The moving request dot makes the boundary visible.
export function KeyBoundaryGraph() {
  const t = useTranslations("common.teeEpds.boundary");
  const [mode, setMode] = useState<Mode>("tee");

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 flex justify-center gap-1 rounded-xl bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => setMode("server")}
          aria-pressed={mode === "server"}
          className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
            mode === "server" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("serverTab")}
        </button>
        <button
          type="button"
          onClick={() => setMode("tee")}
          aria-pressed={mode === "tee"}
          className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
            mode === "tee" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("teeTab")}
        </button>
      </div>

      <div className="relative mx-auto grid max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <Node icon={<ServerIcon className="h-5 w-5" />} title={t("pdsName")} active />

        <div className="relative h-px w-12 bg-border sm:w-24" aria-hidden="true">
          <motion.span
            key={mode}
            initial={{ left: 0, opacity: 0 }}
            animate={{ left: "calc(100% - 8px)", opacity: [0, 1, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.65 }}
            className="absolute -top-[3px] h-2 w-2 rounded-full bg-primary"
          />
        </div>

        {mode === "server" ? (
          <Node icon={<KeyRoundIcon className="h-5 w-5" />} title={t("serverKeyName")} active />
        ) : (
          <Node icon={<ShieldCheckIcon className="h-5 w-5" />} title={t("teeName")} active protectedNode />
        )}
      </div>

      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mx-auto mt-6 max-w-xl rounded-xl border px-5 py-4 text-center ${
          mode === "tee" ? "border-primary/30 bg-primary/5" : "border-border/60 bg-background"
        }`}
      >
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
          {mode === "tee" ? t("teeResult") : t("serverResult")}
        </div>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          {mode === "tee" ? t("teeDesc") : t("serverDesc")}
        </p>
      </motion.div>
    </div>
  );
}

function Node({
  icon,
  title,
  active,
  protectedNode = false,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  protectedNode?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-28 flex-col items-center justify-center rounded-2xl border px-3 text-center ${
        protectedNode
          ? "border-primary/50 bg-primary/8 text-primary"
          : active
            ? "border-border bg-background text-foreground"
            : "border-border/60 text-muted-foreground"
      }`}
    >
      {protectedNode && (
        <motion.span
          aria-hidden="true"
          animate={{ opacity: [0.18, 0.45, 0.18], scale: [0.92, 1.04, 0.92] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          className="absolute inset-2 rounded-xl border border-primary/50"
        />
      )}
      <span className="mb-2">{icon}</span>
      <span className="font-mono text-[11.5px] leading-tight">{title}</span>
    </div>
  );
}
