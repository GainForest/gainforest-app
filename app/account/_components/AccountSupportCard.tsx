"use client";

/**
 * A two-column support tile within At a glance. It is wider than the metric
 * tiles for its call to action, while keeping their quiet muted surface.
 * It only appears once a wallet is set up (or once something has already been
 * received); totals come from public records and can lag behind recent gifts.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatCompactUsd } from "@/app/_lib/format";
import { AccountWalletSupport } from "./AccountWalletSupport";

export function AccountSupportCard({
  did,
  name,
  image,
  receivedUsd,
  supporters,
}: {
  did: string;
  name: string;
  image: string | null;
  receivedUsd: number;
  supporters: number;
}) {
  const t = useTranslations("common.accountOverview");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = () => {
      fetch(`/api/verify-recipient?did=${encodeURIComponent(did)}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((result: { hasAttestation?: boolean; address?: string } | null) => {
          if (cancelled) return;
          setWalletAddress(result?.hasAttestation && result.address ? result.address : null);
          setChecked(true);
        })
        .catch(() => {
          if (!cancelled) setChecked(true);
        });
    };

    loadWallet();
    window.addEventListener("gainforest:wallet-changed", loadWallet);
    return () => {
      cancelled = true;
      window.removeEventListener("gainforest:wallet-changed", loadWallet);
    };
  }, [did]);

  const hasHistory = receivedUsd > 0 || supporters > 0;
  if (!hasHistory && (!checked || !walletAddress)) return null;

  return (
    <section
      data-account-overview-support
      aria-label={t("supportTitle")}
      className="col-span-2 grid min-h-20 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-2xl bg-muted p-3"
    >
      <div className="flex min-w-0 flex-col justify-between">
        <p className="text-left text-xs font-medium text-muted-foreground">{t("supportTitle")}</p>
        {hasHistory ? (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold tabular-nums text-foreground">{formatCompactUsd(receivedUsd)}</span>
            {supporters > 0 ? <span className="text-muted-foreground">{t("supporters", { count: supporters })}</span> : null}
          </p>
        ) : null}
      </div>

      <AccountWalletSupport
        did={did}
        name={name}
        image={image}
        walletAddress={walletAddress}
        className="h-8 shrink-0 px-3"
      />
    </section>
  );
}
