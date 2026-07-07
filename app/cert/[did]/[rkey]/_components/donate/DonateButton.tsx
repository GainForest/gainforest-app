"use client";

import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { AmountModal, type DonationBumicert, type DonationFundingConfig } from "./DonationModals";

export function DonateButton({
  bumicert,
  fundingConfig,
  disabled,
  label,
}: {
  bumicert: DonationBumicert;
  fundingConfig: DonationFundingConfig;
  disabled: boolean;
  label: string;
}) {
  const { pushModal, show } = useModal();

  return (
    <Button
      type="button"
      disabled={disabled}
      className="h-9 w-full opacity-90 hover:opacity-100"
      onClick={async () => {
        pushModal(
          {
            id: "bumicert-donate-amount",
            content: <AmountModal bumicert={bumicert} fundingConfig={fundingConfig} />,
          },
          true,
        );
        await show();
      }}
    >
      <HeartIcon className="size-3.5" />
      {label}
    </Button>
  );
}
