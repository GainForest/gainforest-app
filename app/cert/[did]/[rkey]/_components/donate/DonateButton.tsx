"use client";

import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { AmountModal, type DonationBumicert, type DonationFundingConfig } from "./DonationModals";
import { cn } from "@/lib/utils";

export function DonateButton({
  bumicert,
  fundingConfig,
  disabled,
  label,
  className,
}: {
  bumicert: DonationBumicert;
  fundingConfig: DonationFundingConfig;
  disabled: boolean;
  label: string;
  className?: string;
}) {
  const { pushModal, show } = useModal();

  return (
    <Button
      type="button"
      disabled={disabled}
      className={cn("h-11 w-full font-semibold opacity-90 hover:opacity-100", className)}
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
