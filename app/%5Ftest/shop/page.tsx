import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShopClient } from "@/app/shop/_components/ShopClient";

export async function generateMetadata(): Promise<Metadata> {
  const [registry, shop] = await Promise.all([
    getTranslations("cart.testRegistry"),
    getTranslations("shop.meta"),
  ]);

  return {
    title: `${registry("mockBadge")} — ${shop("title")}`,
    description: shop("description"),
    robots: { index: false, follow: false },
  };
}

/**
 * Test route for the shop page.
 *
 * The shop page is a static coming-soon page with no interactive side effects
 * (no checkout, cart, waitlist, or payment functionality). It only contains:
 * - Static product information
 * - External links to GitHub and email
 *
 * This test route renders the exact same production component since there are
 * no side effects to mock.
 */
export default function TestShopPage() {
  return <ShopClient />;
}
