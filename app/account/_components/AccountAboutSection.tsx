import { getTranslations } from "next-intl/server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { RichText } from "@/app/_components/RichText";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import type { AccountRouteData } from "../_lib/account-route";
import { accountSettingsPath } from "../_lib/account-route";
import { AccountSectionHeading } from "./AccountSectionHeading";

/**
 * What this account says about itself — the first thing the Overview shows.
 *
 * The short bio belongs first in the Overview's At a glance section. This
 * section carries only the longer account story; organizations edit that text
 * in place through the shared header editor rather than duplicating its write.
 */
export async function AccountAboutSection({ account }: { account: AccountRouteData }) {
  const t = await getTranslations("common.accountAbout");
  const longDescription = account.kind === "organization" ? account.longDescription?.trim() ?? "" : "";
  const richBody = account.kind === "organization" ? null : account.detail?.richBody ?? null;
  const blurb = account.kind === "organization" ? null : account.detail?.blurb?.trim() ?? null;

  // Group profile edits are role-gated; personal owners always qualify.
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;
  const groupRole: CgsRole | undefined = target?.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;
  const canEditProfile = target
    ? target.kind === "group"
      ? canEditGroupProfile({ kind: "group", role: groupRole }).allowed
      : true
    : false;

  if (account.kind === "organization" && canEditProfile) {
    return (
      <section data-account-about>
        <EditableAccountHeader
          account={account}
          writeRepoDid={target?.kind === "group" ? target.did : undefined}
          groupRole={groupRole}
          settingsHref={accountSettingsPath(account.urlIdentifier)}
          viewPublicHref={null}
          variant="about"
        />
      </section>
    );
  }

  if (!longDescription && !richBody?.length && !blurb) return null;

  return (
    <section data-account-about>
      <AccountSectionHeading>{t("title")}</AccountSectionHeading>
      <div className="mt-4 max-w-3xl space-y-3 text-base leading-7 md:text-lg md:leading-8">
        {longDescription ? (
          <p className="whitespace-pre-line text-muted-foreground">{longDescription}</p>
        ) : null}
        {richBody?.length ? (
          <div className="text-muted-foreground">
            <RichText blocks={richBody} />
          </div>
        ) : blurb ? (
          <p className="text-muted-foreground">{blurb}</p>
        ) : null}
      </div>
    </section>
  );
}
