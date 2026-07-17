"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { AtSignIcon, FingerprintIcon, ScaleIcon, SigmaIcon } from "lucide-react";

type Mode = "one" | "two";

const MODES: Mode[] = ["one", "two"];

// Illustrative addresses only. The point is that the answer is stable for
// one input set and different for another, exactly like the real CREATE2
// derivation the factory performs.
const ADDRESSES: Record<Mode, string> = {
  one: "0x8b3F…a29C",
  two: "0x51dE…7f04",
};

// The wallet address is pure math over three public inputs: the account
// identity, the passkey list, and fixed rules shared by every wallet.
// Switching the passkey list shows the answer moving with the inputs.
export function AddressMath() {
  const t = useTranslations("common.walletService.address");
  const [mode, setMode] = useState<Mode>("one");

  const inputs = [
    {
      id: "account",
      icon: <AtSignIcon className="h-4 w-4" />,
      title: t("account.title"),
      text: t("account.text"),
    },
    {
      id: "passkeys",
      icon: <FingerprintIcon className="h-4 w-4" />,
      title: t("passkeys.title"),
      text: t("passkeys.text"),
    },
    {
      id: "rules",
      icon: <ScaleIcon className="h-4 w-4" />,
      title: t("rules.title"),
      text: t("rules.text"),
    },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
        {MODES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMode(item)}
            aria-pressed={mode === item}
            className={`rounded-lg px-2 py-2 text-[11.5px] font-medium transition-colors sm:text-[12.5px] ${
              mode === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`${item}.tab`)}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {inputs.map((input) => {
          const changed = input.id === "passkeys";
          return (
            <div
              key={input.id}
              className={`rounded-xl border px-4 py-4 ${
                changed ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background"
              }`}
            >
              <div className={changed ? "text-primary" : "text-muted-foreground"}>{input.icon}</div>
              <h3 className="m-0 mt-3 text-[13px] font-medium text-foreground">{input.title}</h3>
              <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{input.text}</p>
              {changed && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <PasskeyChip label={t("passkeyOne")} />
                  <AnimatePresence>
                    {mode === "two" && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <PasskeyChip label={t("passkeyTwo")} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
          <SigmaIcon className="h-3 w-3" />
          {t("mathLabel")}
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="text-center">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
          {t("addressLabel")}
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
            className="inline-block rounded-lg border border-primary/40 bg-background px-4 py-2 font-mono text-[15px] text-primary"
          >
            {ADDRESSES[mode]}
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-5 text-center"
      >
        <h3 className="m-0 text-sm font-medium text-foreground">{t(`${mode}.title`)}</h3>
        <p className="mx-auto mt-1.5 mb-0 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {t(`${mode}.text`)}
        </p>
      </motion.div>
    </div>
  );
}

function PasskeyChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-1 font-mono text-[9.5px] text-primary">
      <FingerprintIcon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
