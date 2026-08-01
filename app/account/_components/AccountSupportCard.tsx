"use client";

/**
 * "Support this account" card on the Overview: what the account has received so
 * far, and a direct way to give. Money goes straight to the account's own
 * wallet, so the card only appears once a wallet is set up (or once something
 * has already been received). Totals come from the public record and can lag
 * behind the most recent gifts.
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
    <section className="rounded-2xl bg-muted/60 p-5">
      <h2 className="text-base font-semibold text-foreground">{t("supportTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("supportBody", { name })}</p>

      {hasHistory ? (
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight text-foreground">
            {formatCompactUsd(receivedUsd)}
          </span>
          {supporters > 0 ? (
            <span className="text-sm text-muted-foreground">
              {t("supporters", { count: supporters })}
            </span>
          ) : null}
        </div>
      ) : null}

      <AccountWalletSupport
        did={did}
        name={name}
        image={image}
        walletAddress={walletAddress}
        className="mt-4 h-11 w-full border-transparent bg-primary text-primary-foreground hover:border-transparent hover:bg-primary/90 hover:text-primary-foreground"
      />
    </section>
  );
}
