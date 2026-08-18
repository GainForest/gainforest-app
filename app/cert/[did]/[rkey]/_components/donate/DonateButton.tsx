"use client";

import { useId } from "react";
import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal, useModal } from "@/components/ui/modal/context";
import { AmountModal, type DonationBumicert, type DonationFundingConfig } from "./DonationModals";
import { cn } from "@/lib/utils";

export function DonateButton({
  bumicert,
  fundingConfig,
  disabled,
  label,
  className,
  onAddedToCart,
}: {
  bumicert: DonationBumicert;
  fundingConfig: DonationFundingConfig;
  disabled: boolean;
  label: string;
  className?: string;
  /** Used by side-effect-free UI experiences; production defaults to /cart. */
  onAddedToCart?: () => void;
}) {
  const { pushModal, show } = useModal();
  const instanceId = useId();
  const modalId = `bumicert-donate-amount-${bumicert.organizationDid}-${bumicert.rkey}-${instanceId}`;

  return (
    <>
      <Button
        type="button"
        disabled={disabled}
        className={cn("h-11 w-full font-semibold opacity-90 hover:opacity-100", className)}
        onClick={async () => {
          // Call-site portal keeps page-level providers (including a memory
          // cart in /_test) while the root ModalHost supplies the real chrome.
          pushModal({ id: modalId }, true);
          await show();
        }}
      >
        <HeartIcon className="size-3.5" />
        {label}
      </Button>
      <ModalPortal id={modalId}>
        <AmountModal
          bumicert={bumicert}
          fundingConfig={fundingConfig}
          onAddedToCart={onAddedToCart}
        />
      </ModalPortal>
    </>
  );
}
