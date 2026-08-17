import { getTranslations } from "next-intl/server";
import { canEditGroupProfile } from "@/app/(manage)/manage/_lib/cgs-permissions";
import type { CgsRole } from "@/app/(manage)/manage/_lib/cgs";
import { EditableAccountHeader } from "@/app/(manage)/manage/_components/EditableAccountHeader";
import { resolveAccountManageAccess } from "@/app/_lib/manage-server";
import type { AccountRouteData } from "../_lib/account-route";
import { accountSettingsPath } from "../_lib/account-route";
import { AccountSectionHeading } from "./AccountSectionHeading";

/**
 * Whether the Overview will render an About section for this account. Mirrors
 * the render decision in {@link AccountAboutSection}:
 *   - A person (user account) has no long-form description, so their short bio
 *     is their About.
 *   - An organization an owner can edit always shows the About editor (even
 *     when empty); everyone else only sees it when there's actual story text.
 * The Overview uses this to avoid reserving an empty story column when a
 * profile has neither an About nor any projects.
 */
export async function accountHasAboutContent(account: AccountRouteData): Promise<boolean> {
  if (account.kind !== "organization") {
    return Boolean(account.description?.trim());
  }
  if ((account.longDescription?.trim() ?? "") !== "") return true;
  const access = await resolveAccountManageAccess(account.urlIdentifier).catch(() => null);
  const target = access?.status === "allowed" ? access.target : null;
  const groupRole: CgsRole | undefined = target?.kind === "group"
    ? target.role === "owner" ? "owner" : target.role === "admin" ? "admin" : "member"
    : undefined;
  return target
    ? target.kind === "group"
      ? canEditGroupProfile({ kind: "group", role: groupRole }).allowed
      : true
    : false;
}

/**
 * What this account says about itself — the first thing the Overview shows.
 *
 * A person has no long-form description, so their short bio becomes their
 * About here (and is therefore dropped from the At a glance list). An
 * organization instead shows its longer story, editable in place by owners,
 * and keeps its short bio in At a glance.
 */
export async function AccountAboutSection({ account }: { account: AccountRouteData }) {
  const t = await getTranslations("common.accountAbout");

  // A person's short bio is their About — no separate long-form text exists.
  if (account.kind !== "organization") {
    const bio = account.description?.trim() ?? "";
    if (!bio) return null;
    return (
      <section data-account-about className="rounded-2xl bg-muted px-4 py-5 sm:px-6">
        <AccountSectionHeading>{t("title")}</AccountSectionHeading>
        <div className="mt-4 max-w-3xl space-y-3 text-base leading-7 md:text-lg md:leading-8">
          <p className="whitespace-pre-line text-muted-foreground">{bio}</p>
        </div>
      </section>
    );
  }

  const longDescription = account.longDescription?.trim() ?? "";

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

  if (canEditProfile) {
    return (
      <section data-account-about className="rounded-2xl bg-muted px-4 py-5 sm:px-6">
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

  // No About content — render nothing at all (including the background panel)
  // so an organization without a story never leaves an empty block behind.
  if (!longDescription) return null;

  return (
    <section data-account-about className="rounded-2xl bg-muted px-4 py-5 sm:px-6">
      <AccountSectionHeading>{t("title")}</AccountSectionHeading>
      <div className="mt-4 max-w-3xl space-y-3 text-base leading-7 md:text-lg md:leading-8">
        <p className="whitespace-pre-line text-muted-foreground">{longDescription}</p>
      </div>
    </section>
  );
}
