"use client";

/**
 * FundingStatus — shown in the donate slot when the logged-in user is the
 * bumicert owner (instead of the public Donate button).
 *
 * Renders a small status line above a full-width action button that opens the
 * FundingConfigModal. Wallet validity is derived client-side from the owner's
 * linked EVM wallets.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useModal } from "@/components/ui/modal/context";
import { Button } from "@/components/ui/button";
import { FundingConfigModal } from "@/components/global/modals/funding/config";
import { MODAL_IDS } from "@/components/global/modals/ids";
import { useEvmLinks, computeWalletFlags, type FundingConfigData } from "@/app/_lib/funding";
import {
  AlertTriangleIcon,
  CircleDotIcon,
  CircleMinusIcon,
  CircleOffIcon,
  ClockIcon,
  SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status derivation ─────────────────────────────────────────────────────────

type DerivedStatus =
  | { kind: "no-config" }
  | { kind: "invalid"; reason: string }
  | { kind: "coming-soon" }
  | { kind: "paused" }
  | { kind: "closed" }
  | { kind: "open" };

function deriveStatus(
  config: FundingConfigData | null,
  receivingWalletValid: boolean,
  receivingWalletTrusted: boolean,
): DerivedStatus {
  if (!config) return { kind: "no-config" };

  if (!config.receivingWallet?.uri) {
    return { kind: "invalid", reason: "No receiving wallet configured." };
  }

  if (!receivingWalletValid) {
    return {
      kind: "invalid",
      reason: "Wallet signature invalid — re-link your wallet.",
    };
  }

  if (!receivingWalletTrusted) {
    return {
      kind: "invalid",
      reason: "Wallet not verified by Bumicerts — re-link through the platform.",
    };
  }

  const s = config.status ?? "open";
  if (s === "coming-soon") return { kind: "coming-soon" };
  if (s === "paused") return { kind: "paused" };
  if (s === "closed") return { kind: "closed" };
  return { kind: "open" };
}

// ── Status UI config ──────────────────────────────────────────────────────────

type StatusUiConfig = {
  label: string;
  icon: React.ReactNode;
  labelClass: string;
  buttonLabel: string;
  buttonVariant: "default" | "outline";
};

function getStatusUi(derived: DerivedStatus): StatusUiConfig {
  const iconClass = "size-3.5 shrink-0";
  switch (derived.kind) {
    case "no-config":
      return {
        label: "Donations not set up",
        icon: <CircleOffIcon className={cn(iconClass, "text-muted-foreground")} />,
        labelClass: "text-muted-foreground",
        buttonLabel: "Enable Donations",
        buttonVariant: "default",
      };
    case "invalid":
      return {
        label: derived.reason,
        icon: <AlertTriangleIcon className={cn(iconClass, "text-destructive")} />,
        labelClass: "text-destructive",
        buttonLabel: "Update Settings",
        buttonVariant: "default",
      };
    case "coming-soon":
      return {
        label: "Coming Soon",
        icon: <ClockIcon className={cn(iconClass, "text-muted-foreground")} />,
        labelClass: "text-muted-foreground",
        buttonLabel: "Manage Donations",
        buttonVariant: "outline",
      };
    case "paused":
      return {
        label: "Donations paused",
        icon: <CircleMinusIcon className={cn(iconClass, "text-muted-foreground")} />,
        labelClass: "text-muted-foreground",
        buttonLabel: "Manage Donations",
        buttonVariant: "outline",
      };
    case "closed":
      return {
        label: "Donations closed",
        icon: <CircleOffIcon className={cn(iconClass, "text-muted-foreground")} />,
        labelClass: "text-muted-foreground",
        buttonLabel: "Manage Donations",
        buttonVariant: "outline",
      };
    case "open":
      return {
        label: "Accepting donations",
        icon: <CircleDotIcon className={cn(iconClass, "text-primary")} />,
        labelClass: "text-primary",
        buttonLabel: "Manage Donations",
        buttonVariant: "outline",
      };
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FundingStatusProps {
  ownerDid: string;
  bumicertRkey: string;
  fundingConfig: FundingConfigData | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FundingStatus({
  ownerDid,
  bumicertRkey,
  fundingConfig,
}: FundingStatusProps) {
  const router = useRouter();
  const { pushModal, show } = useModal();
  const { data: evmLinks } = useEvmLinks(ownerDid);

  const { valid, trusted } = computeWalletFlags(fundingConfig, evmLinks);
  const derived = deriveStatus(fundingConfig, valid, trusted);
  const ui = getStatusUi(derived);

  const handleConfigSaved = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleOpenModal = useCallback(() => {
    pushModal(
      {
        id: MODAL_IDS.FUNDING_CONFIG,
        content: (
          <FundingConfigModal
            ownerDid={ownerDid}
            bumicertRkey={bumicertRkey}
            existingConfig={fundingConfig}
            onSaved={handleConfigSaved}
          />
        ),
      },
      true,
    );
    show();
  }, [ownerDid, bumicertRkey, fundingConfig, handleConfigSaved, pushModal, show]);

  // Mirrors the visitor's donate area: flex flex-col gap-1 w-full
  //   small status line, then a full-width Button.
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className={cn("flex items-center gap-1.5 justify-center text-sm", ui.labelClass)}>
        {ui.icon}
        <span>{ui.label}</span>
      </div>

      <Button
        onClick={handleOpenModal}
        variant={ui.buttonVariant}
        className="w-full"
      >
        <SettingsIcon className="size-3.5" />
        {ui.buttonLabel}
      </Button>
    </div>
  );
}
