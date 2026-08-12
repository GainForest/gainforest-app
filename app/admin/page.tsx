import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * /admin used to be one page with a tab bar; each area is now its own page,
 * reached from the sidebar's ADMIN section. Old `?tab=…` links still land on
 * the page that now holds that view.
 */
const TAB_REDIRECTS: Record<string, string> = {
  grants: "/admin/grants",
  bioblitz: "/admin/grants",
  taina: "/admin/people",
  endorsers: "/admin/people",
  awardEndorsements: "/admin/people",
  testAccounts: "/admin/trust",
  blockedDomains: "/admin/trust",
  dataJobs: "/admin/data",
  facilitator: "/admin/data",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Access is gated by app/admin/layout.tsx, which every admin route shares.
  const { tab } = await searchParams;
  redirect((tab && TAB_REDIRECTS[tab]) || "/admin/grants");
}
