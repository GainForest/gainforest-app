"use client";

import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCart } from "./CartProvider";

/** Header shortcut to the donation cart, with a live item-count badge. */
export function CartHeaderButton() {
  const t = useTranslations("cart.header");
  const { hydrated, count } = useCart();

  // An empty cart is not a destination users need in persistent chrome. Once
  // something is added, the shortcut and count appear immediately.
  if (!hydrated || count === 0) return null;

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label={t("openCart", { count })}>
      <Link href="/cart">
        <ShoppingCartIcon />
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
        >
          {count > 9 ? "9+" : count}
        </span>
      </Link>
    </Button>
  );
}
