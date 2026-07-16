"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { DatabaseIcon, KeyRoundIcon, LifeBuoyIcon, SmartphoneIcon } from "lucide-react";

type Scenario = "everyday" | "recover" | "leave";

const SCENARIOS: Scenario[] = ["everyday", "recover", "leave"];

const ACTIVE_SHARES: Record<Scenario, Set<string>> = {
  everyday: new Set(["device", "protected"]),
  recover: new Set(["protected", "recovery"]),
  leave: new Set(["device", "recovery"]),
};

// Wallet entropy is split so no single party can reconstruct it. This graph
// shows the three useful two-share combinations without exposing protocol
// details that are not needed to understand the custody model.
export function WalletRecovery() {
  const t = useTranslations("common.teeEpds.shares");
  const [scenario, setScenario] = useState<Scenario>("everyday");
  const activeShares = ACTIVE_SHARES[scenario];

  const shares = [
    {
      id: "device",
      icon: <SmartphoneIcon className="h-5 w-5" />,
      title: t("device.title"),
      text: t("device.text"),
    },
    {
      id: "protected",
      icon: <DatabaseIcon className="h-5 w-5" />,
      title: t("protected.title"),
      text: t("protected.text"),
    },
    {
      id: "recovery",
      icon: <LifeBuoyIcon className="h-5 w-5" />,
      title: t("recovery.title"),
      text: t("recovery.text"),
    },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-6">
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
        {SCENARIOS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setScenario(item)}
            aria-pressed={scenario === item}
            className={`rounded-lg px-2 py-2 text-[11.5px] font-medium transition-colors sm:text-[12.5px] ${
              scenario === item
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(`scenarios.${item}.tab`)}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {shares.map((share) => {
          const active = activeShares.has(share.id);
          return (
            <motion.div
              key={share.id}
              animate={{ opacity: active ? 1 : 0.45, y: active ? 0 : 3 }}
              className={`rounded-xl border px-4 py-4 ${
                active ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background"
              }`}
            >
              <div className={active ? "text-primary" : "text-muted-foreground"}>{share.icon}</div>
              <h3 className="m-0 mt-3 text-[13px] font-medium text-foreground">{share.title}</h3>
              <p className="m-0 mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{share.text}</p>
              <div
                className={`mt-3 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
                  active ? "text-primary" : "text-muted-foreground/60"
                }`}
              >
                {active ? t("used") : t("notNeeded")}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
          <KeyRoundIcon className="h-3 w-3" />
          {t("threshold")}
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>

      <motion.div
        key={scenario}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h3 className="m-0 text-sm font-medium text-foreground">{t(`scenarios.${scenario}.title`)}</h3>
        <p className="mx-auto mt-1.5 mb-0 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {t(`scenarios.${scenario}.text`)}
        </p>
      </motion.div>
    </div>
  );
}
