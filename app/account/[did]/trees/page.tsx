import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { accountObservationsPath, getAccountRouteData, readAccountRouteParams } from "../../_lib/account-route";

export const metadata: Metadata = {
  title: "Trees — GainForest",
  robots: { index: false, follow: false },
};

// Trees are occurrences with measurements, so the dedicated Trees view has been
// folded into the Observations surface as its Measurements layer. The upload
// wizard (reached from "Add data") is preserved by forwarding ?mode=upload.
export default async function AccountTreesPage({
  params,
  searchParams,
}: {
  params: Promise<{ did: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);
  const mode = (await searchParams).mode;
  const isUpload = (Array.isArray(mode) ? mode[0] : mode) === "upload";
  const base = `${accountObservationsPath(account.urlIdentifier)}?layer=measurements`;
  redirect(isUpload ? `${base}&mode=upload` : base);
}
