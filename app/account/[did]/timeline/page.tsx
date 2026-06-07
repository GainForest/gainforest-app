import { redirect } from "next/navigation";
import { accountObservationsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export default async function AccountTimelinePage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  redirect(accountObservationsPath(account.urlIdentifier));
}
