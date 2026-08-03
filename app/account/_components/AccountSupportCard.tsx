"use client";

/**
 * A two-column support tile within At a glance. It deliberately breaks the
 * smaller metric-tile rhythm so the account's direct call to action is clear.
 * It only appears once a wallet is set up (or once something has already been
 * received); totals come from public records and can lag behind recent gifts.
 */

import { useEffect, useState } from "react";
import { HeartHandshakeIcon } from "lucide-react";
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
      className="relative col-span-2 grid min-h-20 min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 overflow-hidden rounded-2xl bg-primary p-3 text-primary-foreground"
    >
      <HeartHandshakeIcon
        aria-hidden
        className="pointer-events-none absolute -bottom-3 -left-3 size-16 text-primary-foreground opacity-20"
      />
      <div className="relative z-10 flex min-w-0 flex-col justify-between">
        <p className="text-left text-xs font-medium text-primary-foreground/80">{t("supportTitle")}</p>
        {hasHistory ? (
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold tabular-nums text-primary-foreground">{formatCompactUsd(receivedUsd)}</span>
            {supporters > 0 ? <span className="text-primary-foreground/80">{t("supporters", { count: supporters })}</span> : null}
          </p>
        ) : null}
      </div>

      <AccountWalletSupport
        did={did}
        name={name}
        image={image}
        walletAddress={walletAddress}
        className="relative z-10 h-8 shrink-0 border-primary-foreground/20 bg-primary-foreground px-3 text-primary hover:bg-primary-foreground/90 hover:text-primary"
      />
    </section>
  );
}
