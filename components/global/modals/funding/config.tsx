"use client";

/**
 * FundingConfigModal — lets a bumicert owner set up or update their
 * donation settings.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from "@/components/ui/modal/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  upsertFundingConfig,
  type FundingConfigData,
} from "@/app/_lib/funding";
import { OrgWalletModal } from "@/components/global/modals/wallet/org-vault";
import { MODAL_IDS } from "@/components/global/modals/ids";
import type { SplitsVaultRecord } from "@/lib/splits-vault/shared";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  FingerprintIcon,
  Loader2Icon,
  WalletIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(address: string | null | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type VaultPanelState =
  | { status: "loading" }
  | { status: "none"; viewerRole: "owner" | "admin" | "member" }
  | { status: "ready"; viewerRole: "owner" | "admin" | "member"; uri: string; record: SplitsVaultRecord }
  | { status: "unavailable" };

// ── Styled select ─────────────────────────────────────────────────────────────

function StyledSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
          "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "appearance-none pr-8 dark:bg-input/30",
          !value && "text-muted-foreground",
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
    </div>
  );
}

// ── Status options ────────────────────────────────────────────────────────────

const STATUS_VALUES = ["open", "coming-soon", "paused", "closed"] as const;

type StatusValue = (typeof STATUS_VALUES)[number];

function isStatusValue(value: string): value is StatusValue {
  return STATUS_VALUES.some((option) => option === value);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FundingConfigModalProps {
  ownerDid: string;
  bumicertRkey: string;
  existingConfig: FundingConfigData | null;
  mutationRepo?: string;
  onSaved: (config: FundingConfigData) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FundingConfigModal({
  ownerDid,
  bumicertRkey,
  existingConfig,
  mutationRepo,
  onSaved,
}: FundingConfigModalProps) {
  const t = useTranslations("modals.fundingConfig");
  const walletT = useTranslations("modals.orgWallet");
  const { pushModal, popModal, stack, hide } = useModal();

  // Donation wallets are organization-owned Splits smart accounts. Personal
  // projects can no longer link wallets — only a previously saved wallet
  // keeps working.
  const orgDid = mutationRepo?.trim() || null;
  const [vault, setVault] = useState<VaultPanelState>({ status: orgDid ? "loading" : "unavailable" });

  const loadVault = useCallback(async () => {
    if (!orgDid) return;
    try {
      const response = await fetch(`/api/org-wallet?repo=${encodeURIComponent(orgDid)}`);
      if (!response.ok) {
        setVault({ status: "unavailable" });
        return;
      }
      const json = (await response.json()) as {
        exists: boolean;
        viewerRole: "owner" | "admin" | "member";
        record?: SplitsVaultRecord;
        uri?: string;
      };
      if (json.exists && json.record && json.uri) {
        setVault({ status: "ready", viewerRole: json.viewerRole, uri: json.uri, record: json.record });
      } else {
        setVault({ status: "none", viewerRole: json.viewerRole });
      }
    } catch {
      setVault({ status: "unavailable" });
    }
  }, [orgDid]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  // ── Form state ─────────────────────────────────────────────────────────────

  const initialStatus = existingConfig?.status;
  const [selectedWalletUri, setSelectedWalletUri] = useState<string>(
    existingConfig?.receivingWallet?.uri ?? "",
  );
  const [status, setStatus] = useState<StatusValue>(
    initialStatus && isStatusValue(initialStatus) ? initialStatus : "open",
  );
  const [goalInUSD, setGoalInUSD] = useState(existingConfig?.goalInUSD ?? "");
  const [minDonationInUSD, setMinDonationInUSD] = useState(
    existingConfig?.minDonationInUSD ?? "",
  );
  const [maxDonationInUSD, setMaxDonationInUSD] = useState(
    existingConfig?.maxDonationInUSD ?? "",
  );
  const [allowOversell, setAllowOversell] = useState(
    existingConfig?.allowOversell ?? true,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Close ──────────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      popModal();
    }
  };

  // ── Organization wallet flow ─────────────────────────────────────────────

  const handleOpenOrgWallet = () => {
    if (!orgDid) return;
    const hadVault = vault.status === "ready";
    pushModal({
      id: MODAL_IDS.WALLET_MANAGE,
      content: (
        <OrgWalletModal
          orgDid={orgDid}
          onBack={() => popModal()}
          onChanged={(uri) => {
            void loadVault();
            if (!uri) return;
            setSelectedWalletUri(uri);
            // "One-click" setup: a wallet created while no donation settings
            // exist yet opens donations immediately with the new wallet,
            // instead of asking for another Save press.
            if (!existingConfig && !hadVault) void saveConfig(uri);
          }}
        />
      ),
    });
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const saveConfig = async (receivingWalletUri: string) => {
    setSaveError(null);
    setIsSaving(true);

    try {
      const savedConfig = await upsertFundingConfig({
        rkey: bumicertRkey,
        receivingWalletUri,
        status,
        allowOversell,
        repo: mutationRepo,
        createdAt: existingConfig?.createdAt ?? null,
        ...(goalInUSD.trim() ? { goalInUSD: goalInUSD.trim() } : {}),
        ...(minDonationInUSD.trim() ? { minDonationInUSD: minDonationInUSD.trim() } : {}),
        ...(maxDonationInUSD.trim() ? { maxDonationInUSD: maxDonationInUSD.trim() } : {}),
      });

      onSaved(savedConfig);
      handleClose();
    } catch (e) {
      console.error("[FundingConfigModal] Failed to save funding config:", e);
      setSaveError(t("saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!effectiveSelectedWalletUri) return;
    await saveConfig(effectiveSelectedWalletUri);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const savedWalletUri = existingConfig?.receivingWallet?.uri ?? "";
  // The organization wallet is the only selectable wallet; a previously saved
  // wallet keeps working until the organization wallet replaces it.
  const effectiveSelectedWalletUri =
    vault.status === "ready" ? vault.uri : selectedWalletUri || savedWalletUri;

  return (
    <ModalContent dismissible={false}>
      <ModalHeader backAction={stack.length > 1 ? handleClose : undefined}>
        <ModalTitle>{t("title")}</ModalTitle>
      </ModalHeader>

      <div className="flex flex-col gap-4 pt-1">
        {/* ── {t("receivingWallet")} ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <WalletIcon className="size-3.5 text-muted-foreground" />
              {t("receivingWallet")}
            </Label>
            {vault.status === "ready" && (
              <button
                type="button"
                onClick={handleOpenOrgWallet}
                className="text-xs text-primary hover:underline"
              >
                {t("manage")}
              </button>
            )}
          </div>

          {vault.status === "loading" ? (
            <div className="flex items-center justify-center h-9 rounded-md border border-input">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : vault.status === "ready" ? (
            <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2">
              <FingerprintIcon className="size-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm leading-snug truncate">{vault.record.name || walletT("defaultName")}</span>
                <span className="text-xs text-muted-foreground font-mono leading-snug">{formatAddress(vault.record.address)}</span>
              </div>
            </div>
          ) : vault.status === "none" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleOpenOrgWallet}
                data-taina="add-donation-wallet"
                className="flex items-center justify-center gap-1.5 h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-xs hover:opacity-90 transition-opacity"
              >
                <FingerprintIcon className="size-3.5" />
                {vault.viewerRole !== "member" ? walletT("createButton") : walletT("title")}
              </button>
              <p className="text-xs text-muted-foreground text-center">
                {vault.viewerRole !== "member" ? walletT("emptyHint") : walletT("onlyOwnerCanCreate")}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
              <AlertTriangleIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-snug">
                {savedWalletUri ? t("orgOnlySavedWallet") : t("orgOnly")}
              </p>
            </div>
          )}
        </div>

        {/* ── Status ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Label>{t("status")}</Label>
          <StyledSelect
            value={status}
            onChange={(value) => {
              if (isStatusValue(value)) {
                setStatus(value);
              }
            }}
            options={[
              { value: "open", label: t("statusOptions.open") },
              { value: "coming-soon", label: t("statusOptions.coming-soon") },
              { value: "paused", label: t("statusOptions.paused") },
              { value: "closed", label: t("statusOptions.closed") },
            ]}
          />
        </div>

        {/* ── {t("advanced")} ─────────────────────────────────────────────────────── */}
        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="py-1.5 text-muted-foreground hover:no-underline hover:text-foreground text-sm font-normal">
              {t("advanced")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3 pt-1">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-normal">
                    {t("fundingGoal")}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                      $
                    </span>
                    <Input
                      inputMode="decimal"
                      placeholder={t("noGoal")}
                      value={goalInUSD}
                      onChange={(e) =>
                        setGoalInUSD(e.target.value.replace(/[^0-9.]/g, ""))
                      }
                      className="pl-6"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground font-normal">
                      {t("minDonation")}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                        $
                      </span>
                      <Input
                        inputMode="decimal"
                        placeholder={t("none")}
                        value={minDonationInUSD}
                        onChange={(e) =>
                          setMinDonationInUSD(
                            e.target.value.replace(/[^0-9.]/g, ""),
                          )
                        }
                        className="pl-6"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground font-normal">
                      {t("maxDonation")}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                        $
                      </span>
                      <Input
                        inputMode="decimal"
                        placeholder={t("none")}
                        value={maxDonationInUSD}
                        onChange={(e) =>
                          setMaxDonationInUSD(
                            e.target.value.replace(/[^0-9.]/g, ""),
                          )
                        }
                        className="pl-6"
                      />
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={allowOversell}
                    onCheckedChange={(c) => setAllowOversell(c === true)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {t("allowOversell")}
                  </span>
                </label>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      <ModalFooter className="flex flex-col gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaving || !effectiveSelectedWalletUri}
          className="w-full"
        >
          {isSaving ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={handleClose} className="w-full">
          {t("cancel")}
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
