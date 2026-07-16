"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { DatabaseIcon, FileCheck2Icon, PenLineIcon, WalletCardsIcon } from "lucide-react";

type Side = "account" | "wallet";

// The public binding record points in two directions. The account publishes
// the record in its own repo, and the wallet key signs the link from its
// side. Anyone can verify both halves with public data.
export function BindingGraph() {
  const t = useTranslations("common.walletService.binding");
  const [side, setSide] = useState<Side>("account");

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 flex justify-center gap-1 rounded-xl bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => setSide("account")}
          aria-pressed={side === "account"}
          className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
            side === "account" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("accountTab")}
        </button>
        <button
          type="button"
          onClick={() => setSide("wallet")}
          aria-pressed={side === "wallet"}
          className={`flex-1 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors ${
            side === "wallet" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("walletTab")}
        </button>
      </div>

      <div className="relative mx-auto grid max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        {side === "account" ? (
          <Node icon={<DatabaseIcon className="h-5 w-5" />} title={t("repoName")} />
        ) : (
          <Node icon={<WalletCardsIcon className="h-5 w-5" />} title={t("walletName")} highlighted />
        )}

        <div className="relative h-px w-12 bg-border sm:w-24" aria-hidden="true">
          <motion.span
            key={side}
            initial={{ left: 0, opacity: 0 }}
            animate={{ left: "calc(100% - 8px)", opacity: [0, 1, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.65 }}
            className="absolute -top-[3px] h-2 w-2 rounded-full bg-primary"
          />
        </div>

        {side === "account" ? (
          <Node icon={<FileCheck2Icon className="h-5 w-5" />} title={t("recordName")} highlighted />
        ) : (
          <Node icon={<PenLineIcon className="h-5 w-5" />} title={t("signatureName")} />
        )}
      </div>

      <motion.div
        key={side}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto mt-6 max-w-xl rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 text-center"
      >
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-primary">
          {side === "account" ? t("accountResult") : t("walletResult")}
        </div>
        <p className="m-0 text-[13.5px] leading-relaxed text-muted-foreground">
          {side === "account" ? t("accountDesc") : t("walletDesc")}
        </p>
      </motion.div>
    </div>
  );
}

function Node({
  icon,
  title,
  highlighted = false,
}: {
  icon: React.ReactNode;
  title: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-28 flex-col items-center justify-center rounded-2xl border px-3 text-center ${
        highlighted ? "border-primary/50 bg-primary/8 text-primary" : "border-border bg-background text-foreground"
      }`}
    >
      {highlighted && (
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
