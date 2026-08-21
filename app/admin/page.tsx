import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChartColumnIcon, ChevronRightIcon, DatabaseIcon, ShieldCheckIcon, SproutIcon, UsersIcon } from "lucide-react";
import { AdminPageHeader } from "./_components/AdminPageHeader";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Old `?tab=…` links from when /admin was a single nine-tab page. Each one
 * still opens the exact panel it named, on the page that now holds it.
 */
const TAB_REDIRECTS: Record<string, string> = {
  grants: "/admin/grants",
  rewilding: "/admin/grants",
  bioblitz: "/admin/grants",
  taina: "/admin/people",
  endorsers: "/admin/people",
  awardEndorsements: "/admin/people",
  testAccounts: "/admin/trust",
  blockedDomains: "/admin/trust",
  dataJobs: "/admin/data",
  facilitator: "/admin/data",
};

/**
 * The admin home: four cards, one per area, each listing the panels it holds.
 * Admin isn't in the sidebar — it's staff-only and reached from the account
 * menu — so this hub is what makes every area one click away.
 *
 * Deliberately loads nothing: the areas fetch their own data (a Tainá runtime
 * call, an S3 listing, a wallet read), and pulling all of that just to render
 * a menu is what made the old single page slow.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Access is gated once in app/admin/layout.tsx, which wraps every admin route.
  const { tab } = await searchParams;
  const legacy = tab ? TAB_REDIRECTS[tab] : undefined;
  if (legacy) redirect(`${legacy}?tab=${tab}`);

  const t = await getTranslations("common.adminModeration");

  const areas = [
    {
      href: "/admin/grants",
      Icon: SproutIcon,
      title: t("pages.grants.title"),
      items: [t("tabs.grants"), t("rewilding.title"), t("tabs.bioblitz")],
    },
    {
      href: "/admin/people",
      Icon: UsersIcon,
      title: t("pages.people.title"),
      items: [
        t("tabs.taina"),
        t("tabs.walletConnections"),
        t("tabs.endorsers"),
        t("tabs.awardEndorsements"),
      ],
    },
    {
      href: "/admin/trust",
      Icon: ShieldCheckIcon,
      title: t("pages.trust.title"),
      items: [t("tabs.testAccounts"), t("tabs.blockedDomains")],
    },
    {
      href: "/admin/data",
      Icon: DatabaseIcon,
      title: t("pages.data.title"),
      items: [t("tabs.dataJobs"), t("tabs.facilitator")],
    },
    {
      href: "/admin/statistics",
      Icon: ChartColumnIcon,
      title: t("pages.statistics.title"),
      items: [t("tabs.walletsCreated")],
    },
  ];

  return (
    <>
      <AdminPageHeader Icon={ShieldCheckIcon} title={t("pages.hub.title")} subtitle={t("pages.hub.subtitle")} />
      <ul className="grid gap-4 sm:grid-cols-2">
        {areas.map((area) => (
          <li key={area.href}>
            <Link
              href={area.href}
              className="group flex h-full flex-col rounded-3xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/[0.08] text-primary">
                  <area.Icon className="size-4" />
                </span>
                <span className="text-base font-semibold text-foreground">{area.title}</span>
                <ChevronRightIcon className="ms-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-2 text-sm leading-6 text-muted-foreground">{area.items.join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
