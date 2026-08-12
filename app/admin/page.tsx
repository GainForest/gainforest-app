import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * /admin used to be one page with nine tabs; the tabs are now split across
 * four pages reached from the sidebar's ADMIN section, each keeping its own
 * pill bar. Old `?tab=…` links still land on the exact view they named.
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
  const page = tab ? TAB_REDIRECTS[tab] : undefined;
  // Carry the tab through so an old link opens the panel it named, not just
  // the page that now holds it.
  redirect(page ? `${page}?tab=${tab}` : "/admin/grants");
}
