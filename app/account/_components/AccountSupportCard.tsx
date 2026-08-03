"use client";

/**
 * A compact support action within At a glance. The account story leads the
 * page, so support stays available without competing with it as a large card.
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
    <section className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{t("supportTitle")}</h2>
        {hasHistory ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{formatCompactUsd(receivedUsd)}</span>
            {supporters > 0 ? <span>{t("supporters", { count: supporters })}</span> : null}
          </p>
        ) : null}
      </div>

      <AccountWalletSupport
        did={did}
        name={name}
        image={image}
        walletAddress={walletAddress}
        className="h-9 shrink-0 px-3"
      />
    </section>
  );
}
