"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CoinsIcon, FingerprintIcon, LockIcon, PlusIcon, WalletCardsIcon } from "lucide-react";

type Phase = "dormant" | "active";

const PHASES: Phase[] = ["dormant", "active"];

// The wallet has two lives. While dormant it is only an address plus a
// record: donations can already arrive and the passkey list can still
// change. The first outgoing payment installs it on the blockchain, and
// from then on the record is frozen and signer changes happen on-chain.
export function Lifecycle() {
  const t = useTranslations("common.walletService.lifecycle");
  const [phase, setPhase] = useState<Phase>("dormant");
  const dormant = phase === "dormant";

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
        {PHASES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPhase(item)}
            aria-pressed={phase === item}
            className={`rounded-lg px-2 py-2 text-[11.5px] font-medium transition-colors sm:text-[12.5px] ${
              phase === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`${item}.tab`)}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-xl rounded-2xl border border-border/60 bg-background px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border ${
                dormant ? "border-border text-muted-foreground" : "border-primary bg-primary/10 text-primary"
              }`}
            >
              {dormant && (
                <motion.span
                  aria-hidden="true"
                  animate={{ opacity: [0.15, 0.5, 0.15], scale: [0.95, 1.12, 0.95] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                  className="absolute inset-0 rounded-full border border-primary/40"
                />
              )}
              <WalletCardsIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <div className="font-mono text-[12.5px] text-foreground">0x8b3F…a29C</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CoinsIcon className="h-3 w-3 text-primary" />
                {t("receives")}
              </div>
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
              dormant ? "border-border text-muted-foreground" : "border-primary/40 bg-primary/10 text-primary"
            }`}
          >
            {t(`${phase}.badge`)}
          </span>
        </div>

        <div className="mt-4 border-t border-border/60 pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
            {t("signersLabel")}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SignerChip label={t("signerOne")} />
            <SignerChip label={t("signerTwo")} />
            {dormant ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                <PlusIcon className="h-2.5 w-2.5" />
                {t("dormant.editHint")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                <LockIcon className="h-2.5 w-2.5" />
                {t("active.editHint")}
              </span>
            )}
          </div>
        </div>
      </div>

      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 text-center"
      >
        <h3 className="m-0 text-sm font-medium text-foreground">{t(`${phase}.title`)}</h3>
        <p className="mx-auto mt-1.5 mb-0 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {t(`${phase}.text`)}
        </p>
      </motion.div>
    </div>
  );
}

function SignerChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary">
      <FingerprintIcon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
