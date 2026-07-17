"use client";

/**
 * Donation entry point on a cert page: pick an amount, then the project is
 * added to the donation cart. Payment (wallet approvals + optional GainForest
 * tip) happens on /checkout — see app/checkout and app/_components/cart.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheckIcon, EyeIcon, ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useModal } from "@/components/ui/modal/context";
import { ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal/modal";
import { cartItemKey, useCart } from "@/app/_components/cart/CartProvider";

export type DonationBumicert = {
  organizationDid: string;
  rkey: string;
  title: string;
  organizationName: string;
  image?: string | null;
  /** Direct account support reuses this amount picker and the donation cart. */
  kind?: "project" | "account";
};

export type DonationFundingConfig = {
  minDonationInUSD?: string | null;
  maxDonationInUSD?: string | null;
} | null;

const DEFAULT_PRESETS = [5, 10, 25, 50, 100];
const DEFAULT_AMOUNT = 25;

function buildPresets(min: number | null, max: number | null): number[] {
  const lo = min ?? DEFAULT_PRESETS[0]!;
  const hi = max ?? DEFAULT_PRESETS[DEFAULT_PRESETS.length - 1]!;
  if (min === null && max === null) return DEFAULT_PRESETS;

  const filtered = DEFAULT_PRESETS.filter((preset) => preset >= lo && preset <= hi);
  if (min !== null && !filtered.includes(min)) filtered.unshift(min);
  if (max !== null && !filtered.includes(max)) filtered.push(max);
  if (filtered.length >= 3) return [...new Set(filtered)];

  const count = 5;
  const step = Math.max(1, (hi - lo) / (count - 1));
  return [...new Set(Array.from({ length: count }, (_, index) => Math.round(lo + step * index)))];
}

function parseBound(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function AmountModal({
  bumicert,
  fundingConfig,
}: {
  bumicert: DonationBumicert;
  fundingConfig: DonationFundingConfig;
}) {
  const t = useTranslations("cart.amountModal");
  const accountT = useTranslations("common.accountSupport");
  const router = useRouter();
  const { hide, clear } = useModal();
  const { items, addItem } = useCart();
  const minDonation = parseBound(fundingConfig?.minDonationInUSD);
  const maxDonation = parseBound(fundingConfig?.maxDonationInUSD);
  const presets = useMemo(() => buildPresets(minDonation, maxDonation), [minDonation, maxDonation]);
  const alreadyInCart = items.some(
    (item) => cartItemKey(item) === cartItemKey({ orgDid: bumicert.organizationDid, rkey: bumicert.rkey }),
  );
  const initialAmount = presets.includes(DEFAULT_AMOUNT) ? DEFAULT_AMOUNT : presets[Math.floor(presets.length / 2)] ?? DEFAULT_AMOUNT;
  const [amount, setAmount] = useState(initialAmount);
  const [customInput, setCustomInput] = useState(String(initialAmount));

  const isValid =
    Number.isFinite(amount) &&
    amount > 0 &&
    (minDonation === null || amount >= minDonation) &&
    (maxDonation === null || amount <= maxDonation);

  const handleCustomChange = (value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setCustomInput(clean);
    const parsed = Number.parseFloat(clean);
    setAmount(Number.isFinite(parsed) ? parsed : Number.NaN);
  };

  const handleCancel = async () => {
    await hide();
    clear();
  };

  const handleAddToCart = async () => {
    addItem({
      kind: bumicert.kind ?? "project",
      orgDid: bumicert.organizationDid,
      rkey: bumicert.rkey,
      title: bumicert.title,
      orgName: bumicert.kind === "account" ? accountT("cartLabel") : bumicert.organizationName,
      image: bumicert.image ?? null,
      amountUsd: amount,
      minUsd: minDonation,
      maxUsd: maxDonation,
    });
    await hide();
    clear();
    router.push("/cart");
  };

  return (
    <ModalContent dismissible={false} className="min-w-0">
      <ModalHeader>
        <ModalTitle>
          {bumicert.kind === "account"
            ? accountT("modalTitle", { name: bumicert.organizationName })
            : t("title")}
        </ModalTitle>
        <ModalDescription>
          {bumicert.kind === "account"
            ? accountT("modalDescription", { name: bumicert.organizationName })
            : `${bumicert.title} · ${bumicert.organizationName}`}
        </ModalDescription>
      </ModalHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t("amountLabel")}</label>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-background px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <span className="text-lg font-medium text-muted-foreground">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={customInput}
              onChange={(event) => handleCustomChange(event.target.value)}
              className="min-w-0 bg-transparent text-xl font-semibold text-foreground outline-none"
              placeholder="25"
            />
            <span className="col-span-2 text-xs font-medium text-muted-foreground sm:col-span-1 sm:justify-self-end">USDC</span>
          </div>
          {(minDonation !== null || maxDonation !== null) && (
            <p className="text-xs text-muted-foreground">
              {minDonation !== null ? t("minimum", { amount: minDonation }) : ""}
              {minDonation !== null && maxDonation !== null ? " · " : ""}
              {maxDonation !== null ? t("maximum", { amount: maxDonation }) : ""}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmount(preset);
                setCustomInput(String(preset));
              }}
              className={`min-w-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${amount === preset ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted"}`}
            >
              ${preset}
            </button>
          ))}
        </div>

        <ul className="space-y-1.5 rounded-2xl border border-primary/15 bg-primary/[0.05] p-3 text-xs leading-5 text-foreground/75">
          <li className="flex items-start gap-2">
            <BadgeCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              {bumicert.kind === "account"
                ? accountT("directNote", { name: bumicert.organizationName })
                : t("directNote", { organization: bumicert.organizationName })}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <EyeIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>{t("publicNote")}</span>
          </li>
        </ul>
      </div>

      <ModalFooter className="mt-5 flex flex-col gap-2">
        <Button disabled={!isValid} className="w-full" onClick={handleAddToCart}>
          <ShoppingCartIcon className="size-4" /> {alreadyInCart ? t("updateCart") : t("addToCart")}
        </Button>
        <Button variant="outline" onClick={handleCancel} className="w-full">{t("cancel")}</Button>
      </ModalFooter>
    </ModalContent>
  );
}
