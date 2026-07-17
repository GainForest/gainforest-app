"use client";

import { useEffect, useState } from "react";
import { HeartHandshakeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { ACCOUNT_SUPPORT_RKEY } from "@/app/_components/cart/CartProvider";
import { AmountModal } from "@/app/cert/[did]/[rkey]/_components/donate/DonationModals";
import { cn } from "@/lib/utils";

/** Small account-hero action for direct support through the shared cart. */
export function AccountWalletSupport({
  did,
  name,
  image,
  walletAddress: initialWalletAddress = null,
  className,
}: {
  did: string;
  name: string;
  image: string | null;
  walletAddress?: string | null;
  className?: string;
}) {
  const t = useTranslations("common.accountSupport");
  const { pushModal, show } = useModal();
  const [walletAddress, setWalletAddress] = useState(initialWalletAddress);

  useEffect(() => {
    let cancelled = false;
    const loadWallet = () => {
      if (initialWalletAddress) {
        setWalletAddress(initialWalletAddress);
        return;
      }
      fetch(`/api/verify-recipient?did=${encodeURIComponent(did)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((result: { hasAttestation?: boolean; address?: string } | null) => {
          if (!cancelled) setWalletAddress(result?.hasAttestation && result.address ? result.address : null);
        })
        .catch(() => undefined);
    };
    loadWallet();
    window.addEventListener("gainforest:wallet-changed", loadWallet);
    return () => {
      cancelled = true;
      window.removeEventListener("gainforest:wallet-changed", loadWallet);
    };
  }, [did, initialWalletAddress]);

  if (!walletAddress) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("rounded-full border-primary/15 bg-primary/[0.07] px-4 font-semibold text-primary shadow-none hover:border-primary/25 hover:bg-primary/[0.12] hover:text-primary", className)}
      aria-label={t("buttonAria", { name })}
      title={t("buttonAria", { name })}
      onClick={async () => {
        pushModal(
          {
            id: `account-support-${did}`,
            content: (
              <AmountModal
                bumicert={{
                  kind: "account",
                  organizationDid: did,
                  rkey: ACCOUNT_SUPPORT_RKEY,
                  title: name,
                  organizationName: name,
                  image,
                }}
                fundingConfig={null}
              />
            ),
          },
          true,
        );
        await show();
      }}
    >
      <HeartHandshakeIcon aria-hidden />
      {t("button")}
    </Button>
  );
}
