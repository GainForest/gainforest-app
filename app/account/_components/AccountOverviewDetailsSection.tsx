import { fetchAuthSession } from "@/app/_lib/auth-server";
import { AccountOverviewDetails } from "./AccountOverviewDetails";
import { loadAccountMemberships } from "./AccountTabContent";
import type { AccountRouteData } from "../_lib/account-route";

/** Resolves owner-only membership data for the public Overview details card. */
export async function AccountOverviewDetailsSection({ account }: { account: AccountRouteData }) {
  const session = await fetchAuthSession();
  const memberships = await loadAccountMemberships(account, session);
  return <AccountOverviewDetails account={account} memberships={memberships} />;
}
