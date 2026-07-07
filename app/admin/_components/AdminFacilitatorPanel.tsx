"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import type { FacilitatorStats } from "../_lib/facilitator-stats";
import { Button } from "@/components/ui/button";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const int = new Intl.NumberFormat("en-US");

/**
 * Admin view of the facilitator wallet — the platform wallet that settles
 * every donation on Ethereum. Shows the address (copy + Etherscan) and how
 * much money / how many transactions have moved through it.
 */
export function AdminFacilitatorPanel({ stats }: { stats: FacilitatorStats }) {
  const t = useTranslations("common.adminFacilitator");
  const [copied, setCopied] = useState(false);

  if (!stats.address) {
    return (
      <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {t("notConfigured")}
      </div>
    );
  }

  async function copyAddress() {
    if (!stats.address) return;
    try {
      await navigator.clipboard.writeText(stats.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address is still visible and selectable.
    }
  }

  const chainUnavailable = stats.txCount === null && stats.ethBalance === null;
  const receiptsUnavailable = stats.receiptCount === null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("addressLabel")}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <code className="break-all rounded-lg bg-background px-2.5 py-1.5 font-mono text-sm text-foreground">
            {stats.address}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyAddress()}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t("copied") : t("copy")}
          </Button>
          <a
            href={`https://etherscan.io/address/${stats.address}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("viewOnEtherscan")}
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("volume")}
          value={stats.usdVolume === null ? null : usd.format(stats.usdVolume)}
          hint={t("volumeHint")}
        />
        <StatTile
          label={t("receipts")}
          value={stats.receiptCount === null ? null : int.format(stats.receiptCount)}
          hint={t("receiptsHint")}
        />
        <StatTile
          label={t("txCount")}
          value={stats.txCount === null ? null : int.format(stats.txCount)}
          hint={t("txCountHint")}
        />
        <StatTile
          label={t("ethBalance")}
          value={stats.ethBalance === null ? null : `${stats.ethBalance} ETH`}
          hint={t("ethBalanceHint")}
        />
      </dl>

      {chainUnavailable ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {t("chainUnavailable")}
        </p>
      ) : null}
      {receiptsUnavailable ? (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {t("receiptsUnavailable")}
        </p>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string | null; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value ?? "—"}</dd>
      <dd className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</dd>
    </div>
  );
}
