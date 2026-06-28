import { redirect } from "next/navigation";
import { accountPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

// The Organizations tab was retired: the organizations you belong to now show
// as a "Member of…" row in the profile hero. Old links land on the profile.
export default async function AccountOrganizationsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  redirect(accountPath(account.urlIdentifier));
}
