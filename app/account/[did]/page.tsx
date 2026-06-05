import { redirect } from "next/navigation";
import { RichText } from "../../_components/RichText";
import { accountBumicertsPath, getAccountRouteData, readAccountRouteParams } from "../_lib/account-route";

export default async function AccountByDidPage({ params }: { params: Promise<{ did: string }> }) {
  const { did, urlIdentifier } = await readAccountRouteParams(params);
  const account = await getAccountRouteData(did, urlIdentifier);

  if (account.kind === "user") {
    redirect(accountBumicertsPath(account.urlIdentifier));
  }

  if (!account.detail?.richBody?.length && !account.detail?.blurb) return null;

  return (
    <section className="py-1 md:py-2 org-animate org-fade-in-up org-delay-1">
      {account.detail?.richBody?.length ? (
        <RichText blocks={account.detail.richBody} />
      ) : (
        <p className="mt-5 max-w-3xl text-[14px] leading-[1.62] text-foreground/80">
          {account.detail?.blurb}
        </p>
      )}
    </section>
  );
}
