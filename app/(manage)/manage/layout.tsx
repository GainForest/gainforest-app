import { fetchAuthSession } from "@/app/_lib/auth-server";
import { getAccountRouteData } from "@/app/account/_lib/account-route";
import { ManageDashboard } from "./_components/ManageDashboard";

export default async function ManageAccountLayout({ children }: { children: React.ReactNode }) {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);

  return <ManageDashboard account={account}>{children}</ManageDashboard>;
}
