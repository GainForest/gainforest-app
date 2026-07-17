"use client";

/**
 * The donation cart page — MaEarth-style: editable line items on the left,
 * an order summary with the checkout CTA on the right. Amounts stay in the
 * cart (localStorage) until checkout completes them.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompassIcon, ImageIcon, ShoppingCartIcon, WalletIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PreferredBumicertLink } from "@/app/_components/PreferredLinks";
import { cartItemKey, useCart, type CartItem } from "@/app/_components/cart/CartProvider";

function CartItemLink({ item, className, children }: { item: CartItem; className: string; children: ReactNode }) {
  if (item.kind === "account") {
    return (
      <Link href={`/account/${encodeURIComponent(item.orgDid)}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <PreferredBumicertLink did={item.orgDid} rkey={item.rkey} className={className}>
      {children}
    </PreferredBumicertLink>
  );
}

export function itemAmountValid(item: CartItem): boolean {
  if (!Number.isFinite(item.amountUsd) || item.amountUsd <= 0) return false;
  if (item.minUsd !== null && item.amountUsd < item.minUsd) return false;
  if (item.maxUsd !== null && item.amountUsd > item.maxUsd) return false;
  return true;
}

function CartItemRow({ item }: { item: CartItem }) {
  const t = useTranslations("cart.cartPage");
  const { removeItem, setAmount } = useCart();
  const [input, setInput] = useState(String(item.amountUsd));
  const valid = itemAmountValid(item);

  const handleChange = (value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setInput(clean);
    const parsed = Number.parseFloat(clean);
    setAmount(item.orgDid, item.rkey, Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : Number.NaN);
  };

  return (
    <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <CartItemLink
        item={item}
        className="block size-20 shrink-0 overflow-hidden rounded-xl border border-border-soft bg-muted"
      >
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/PDS blob URLs
          <img src={item.image} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            {item.kind === "account" ? <WalletIcon className="size-6" aria-hidden /> : <ImageIcon className="size-6" aria-hidden />}
          </span>
        )}
      </CartItemLink>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CartItemLink
              item={item}
              className="line-clamp-2 text-sm font-semibold text-foreground hover:underline"
            >
              {item.title}
            </CartItemLink>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.orgName}</p>
          </div>
          <button
            type="button"
            onClick={() => removeItem(item.orgDid, item.rkey)}
            className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("removeItem", { title: item.title })}
          >
            <XIcon className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 ${valid ? "border-border" : "border-destructive"}`}
          >
            <span className="text-sm font-medium text-muted-foreground">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={input}
              onChange={(event) => handleChange(event.target.value)}
              className="w-20 bg-transparent text-sm font-semibold text-foreground outline-none"
              aria-label={t("amountFor", { title: item.title })}
            />
            <span className="text-xs font-medium text-muted-foreground">USDC</span>
          </div>
          {item.minUsd !== null || item.maxUsd !== null ? (
            <p className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
              {item.minUsd !== null ? t("minimum", { amount: item.minUsd }) : ""}
              {item.minUsd !== null && item.maxUsd !== null ? " · " : ""}
              {item.maxUsd !== null ? t("maximum", { amount: item.maxUsd }) : ""}
            </p>
          ) : !valid ? (
            <p className="text-xs text-destructive">{t("invalidAmount")}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function CartView() {
  const t = useTranslations("cart.cartPage");
  const router = useRouter();
  const { hydrated, items, count, subtotalUsd } = useCart();
  const allValid = items.every(itemAmountValid);
  const canCheckout = hydrated && count > 0 && allValid;

  if (!hydrated) {
    return <div className="mx-auto w-full max-w-5xl px-4 py-10" aria-busy="true" />;
  }

  if (count === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-20 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
          <ShoppingCartIcon className="size-7" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{t("emptyTitle")}</h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{t("emptyDescription")}</p>
        <Button asChild className="mt-2">
          <Link href="/projects">
            <CompassIcon className="size-4" /> {t("exploreProjects")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
        <span className="text-sm text-muted-foreground">{t("projectCount", { count })}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <ul className="divide-y divide-border-soft rounded-3xl border border-border-soft bg-surface p-5">
          {items.map((item) => (
            <CartItemRow key={cartItemKey(item)} item={item} />
          ))}
        </ul>

        <aside className="rounded-3xl border border-border-soft bg-surface p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{t("donations")}</dt>
              <dd className="font-semibold text-foreground">${subtotalUsd.toFixed(2)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-center justify-between border-t border-border-soft pt-3">
            <span className="text-sm font-semibold text-foreground">{t("total")}</span>
            <span className="text-2xl font-semibold tracking-tight text-foreground">${subtotalUsd.toFixed(2)}</span>
          </div>
          <Button
            size="lg"
            className="mt-4 h-12 w-full"
            disabled={!canCheckout}
            onClick={() => router.push("/checkout")}
          >
            {t("checkout")}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("feesNote")}</p>
          {!allValid ? <p className="mt-2 text-xs text-destructive">{t("fixAmounts")}</p> : null}
        </aside>
      </div>
    </div>
  );
}
