"use client";

/**
 * FundingConfigModal — lets a bumicert owner set up or update their
 * donation settings.
 */

import { useState } from "react";
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
  useEvmLinks,
  upsertFundingConfig,
  isWalletTrusted,
  type FundingConfigData,
  type EvmLink,
} from "@/app/_lib/funding";
import { FACILITATOR_WALLET_ADDRESS } from "@/app/_lib/urls";
import { AddWalletModal } from "@/components/global/modals/wallet/add";
import { ManageWalletsModal } from "@/components/global/modals/wallet/manage";
import { MODAL_IDS } from "@/components/global/modals/ids";
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(address: string | null | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function walletLabel(
  link: EvmLink,
  facilitatorAddress: string | undefined,
): string {
  const addr = formatAddress(link.record?.address);
  const name = link.record?.name;
  const trusted = isWalletTrusted(link, facilitatorAddress);
  const warning = !trusted ? ` · Not verified` : "";
  return name ? `${addr} (${name})${warning}` : `${addr}${warning}`;
}

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
  const createT = useTranslations("modals.walletCreate");
  const { pushModal, popModal, stack, hide } = useModal();
  const facilitatorAddress = FACILITATOR_WALLET_ADDRESS;

  const { data: evmLinks = [], refetch: refetchLinks } = useEvmLinks(ownerDid);

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

  const invalidateLinks = () => {
    refetchLinks();
  };

  // ── Add wallet flow ────────────────────────────────────────────────────────

  const handleAddWallet = () => {
    pushModal({
      id: MODAL_IDS.WALLET_ADD,
      content: (
        <AddWalletModal
          did={ownerDid}
          repo={mutationRepo}
          onBack={() => popModal()}
          onSuccess={(attestationUri) => {
            invalidateLinks();
            popModal();
            if (!attestationUri) return;
            setSelectedWalletUri(attestationUri);
            // "One-click" setup: a wallet created/linked while no donation
            // settings exist yet opens donations immediately with the new
            // wallet, instead of asking for another Save press.
            if (!existingConfig) void saveConfig(attestationUri);
          }}
        />
      ),
    });
  };

  // ── Manage wallets flow ────────────────────────────────────────────────────

  const handleManageWallets = () => {
    pushModal({
      id: MODAL_IDS.WALLET_MANAGE,
      content: (
        <ManageWalletsModal
          ownerDid={ownerDid}
          evmLinks={evmLinks}
          repo={mutationRepo}
          onBack={() => popModal()}
          onChanged={invalidateLinks}
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

  const defaultSelectedWalletUri = existingConfig?.receivingWallet?.uri
    ? ""
    : (evmLinks.find(
        (link) =>
          link.specialMetadata?.valid &&
          isWalletTrusted(link, facilitatorAddress),
      )?.metadata?.uri ??
      evmLinks[0]?.metadata?.uri ??
      "");
  const savedWalletUri = existingConfig?.receivingWallet?.uri ?? "";
  const savedWalletMissing =
    savedWalletUri.length > 0 &&
    !evmLinks.some((link) => link.metadata?.uri === savedWalletUri);
  const hasExplicitSelection = evmLinks.some(
    (link) => link.metadata?.uri === selectedWalletUri,
  );
  const effectiveSelectedWalletUri = hasExplicitSelection
    ? selectedWalletUri
    : savedWalletMissing
      ? ""
      : defaultSelectedWalletUri;

  const selectedLink = evmLinks.find(
    (l) => l.metadata?.uri === effectiveSelectedWalletUri,
  );
  const selectedLinkInvalid =
    selectedLink &&
    (!selectedLink.specialMetadata?.valid ||
      !isWalletTrusted(selectedLink, facilitatorAddress));

  const walletOptions = evmLinks.map((link) => ({
    value: link.metadata?.uri ?? "",
    label: walletLabel(link, facilitatorAddress),
  }));

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
            {evmLinks.length > 0 && (
              <button
                type="button"
                onClick={handleManageWallets}
                className="text-xs text-primary hover:underline"
              >
                {t("manage")}
              </button>
            )}
          </div>

          {evmLinks.length === 0 ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleAddWallet()}
                data-taina="add-donation-wallet"
                className="flex items-center justify-center gap-1.5 h-9 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground shadow-xs hover:opacity-90 transition-opacity"
              >
                <SparklesIcon className="size-3.5" />
                {createT("addWallet")}
              </button>
              <p className="text-xs text-muted-foreground text-center">{createT("createHint")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <StyledSelect
                value={effectiveSelectedWalletUri}
                onChange={setSelectedWalletUri}
                options={walletOptions}
                placeholder={t("selectWallet")}
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => handleAddWallet()}
                title={t("linkNewWallet")}
                data-taina="add-donation-wallet"
                className="flex items-center gap-1 h-9 shrink-0 rounded-md border border-input px-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                <PlusIcon className="size-3.5" />
                {t("link")}
              </button>
            </div>
          )}

          {selectedLinkInvalid && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <AlertTriangleIcon className="size-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive leading-snug">
                {!selectedLink.specialMetadata?.valid
                  ? t("signatureUnverified")
                  : t("notVerified")}
              </p>
            </div>
          )}

          {savedWalletMissing && !hasExplicitSelection && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <AlertTriangleIcon className="size-3.5 text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-destructive leading-snug">
                {t("savedWalletMissing")}
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
