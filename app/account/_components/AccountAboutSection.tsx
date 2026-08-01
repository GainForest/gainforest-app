import { getTranslations } from "next-intl/server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { RichText } from "@/app/_components/RichText";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import type { AccountRouteData } from "../_lib/account-route";
import { accountSettingsPath } from "../_lib/account-route";

/**
 * What this account says about itself — the first thing the Overview shows.
 *
 * Someone landing here wants to know who they're looking at before they see
 * what it has been publishing, so this leads the page: the short bio as a
 * lead line, then the long description. Organizations edit the long text in
 * place; the shared header editor owns that record write, so this mounts its
 * "about" variant rather than duplicating the save logic.
 */
export async function AccountAboutSection({ account }: { account: AccountRouteData }) {
  const t = await getTranslations("common.accountAbout");
  const bio = account.description?.trim() ?? "";
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
      <section data-account-about className="space-y-3">
        {bio ? <p className="max-w-3xl text-base leading-7 text-foreground/85 md:text-lg md:leading-8">{bio}</p> : null}
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

  if (!bio && !longDescription && !richBody?.length && !blurb) return null;

  return (
    <section data-account-about>
      <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
      <div className="mt-3 max-w-3xl space-y-3 text-base leading-7 md:text-lg md:leading-8">
        {bio ? <p className="text-foreground/85">{bio}</p> : null}
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
