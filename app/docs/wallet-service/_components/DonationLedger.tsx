"use client";

// Live experiment 3: the life of a donation, played as a ledger.
//
// The reader advances a small event log. On the left, entries appear the
// way a block explorer would show them; on the right, two meters track
// what actually exists at the address: money and code. The point lands at
// event four, when the first outgoing payment carries the deployment with
// it and the address suddenly grows a contract.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  FileTextIcon,
  PackageIcon,
  RotateCcwIcon,
  SnowflakeIcon,
} from "lucide-react";

type LedgerEvent = {
  id: string;
  kind: "record" | "in" | "deploy" | "out" | "freeze";
  amount?: number;
};

const EVENTS: LedgerEvent[] = [
  { id: "record", kind: "record" },
  { id: "first", kind: "in", amount: 20 },
  { id: "second", kind: "in", amount: 45 },
  { id: "deploy", kind: "deploy" },
  { id: "payout", kind: "out", amount: 30 },
  { id: "freeze", kind: "freeze" },
];

const ICONS: Record<LedgerEvent["kind"], React.ReactNode> = {
  record: <FileTextIcon className="h-3.5 w-3.5" />,
  in: <ArrowDownLeftIcon className="h-3.5 w-3.5" />,
  deploy: <PackageIcon className="h-3.5 w-3.5" />,
  out: <ArrowUpRightIcon className="h-3.5 w-3.5" />,
  freeze: <SnowflakeIcon className="h-3.5 w-3.5" />,
};

export function DonationLedger() {
  const t = useTranslations("common.walletExplainer.ledger");
  const [step, setStep] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  const visible = EVENTS.slice(0, step);
  const balance = visible.reduce(
    (sum, event) => sum + (event.kind === "in" ? event.amount! : event.kind === "out" ? -event.amount! : 0),
    0,
  );
  const deployed = visible.some((event) => event.kind === "deploy");
  const done = step >= EVENTS.length;

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  return (
    <figure className="my-8 rounded-md border border-border bg-muted/20">
      <figcaption className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{t("bench")}</span>
        <div className="flex gap-1.5">
          {done ? (
            <button
              type="button"
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcwIcon className="h-3 w-3" />
              {t("replay")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(EVENTS.length, s + 1))}
              className="rounded-md bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground"
            >
              {step === 0 ? t("start") : t("next")}
            </button>
          )}
        </div>
      </figcaption>

      <div className="grid gap-0 sm:grid-cols-[1fr_13rem]">
        {/* The ledger. */}
        <ol ref={listRef} className="m-0 flex h-64 list-none flex-col gap-1.5 overflow-y-auto p-4 sm:p-5">
          {visible.length === 0 && (
            <li className="m-auto max-w-xs text-center text-[12.5px] leading-relaxed text-muted-foreground">
              {t("empty")}
            </li>
          )}
          <AnimatePresence initial={false}>
            {visible.map((event) => (
              <motion.li
                key={event.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${
                  event.kind === "deploy"
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 ${
                    event.kind === "deploy" || event.kind === "in" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {ICONS[event.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-foreground">{t(`events.${event.id}.title`)}</span>
                    {event.amount !== undefined && (
                      <span className={`font-mono text-[12px] ${event.kind === "in" ? "text-primary" : "text-muted-foreground"}`}>
                        {event.kind === "in" ? "+" : "−"}{event.amount} USDC
                      </span>
                    )}
                  </div>
                  <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                    {t(`events.${event.id}.body`)}
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        {/* What exists at the address. */}
        <div className="flex flex-col justify-center gap-4 border-t border-border bg-background/60 p-4 sm:border-t-0 sm:border-l sm:p-5">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("balanceLabel")}</div>
            <motion.div
              key={balance}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className="mt-1 font-mono text-2xl font-medium tracking-tight text-foreground"
            >
              {balance}
              <span className="ml-1 text-[12px] text-muted-foreground">USDC</span>
            </motion.div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{t("codeLabel")}</div>
            <div className={`mt-1 font-mono text-[12.5px] ${deployed ? "text-primary" : "text-muted-foreground"}`}>
              {deployed ? t("codeDeployed") : t("codeNone")}
            </div>
          </div>
          <p className="m-0 text-[11px] leading-relaxed text-muted-foreground/80">
            {deployed ? t("meterNoteAfter") : t("meterNoteBefore")}
          </p>
        </div>
      </div>
    </figure>
  );
}
