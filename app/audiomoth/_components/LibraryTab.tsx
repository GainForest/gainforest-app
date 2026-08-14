"use client";

/**
 * The Audio hub's Files tab: every folder and recording the acting account
 * has uploaded, in one browsable place. It embeds the exact same viewer the
 * profile's Audio tab uses (AccountAudioViewer) — folders with rename /
 * move / delete, and the spectrogram player per recording — so the two
 * surfaces can never drift apart.
 *
 * The acting account is the signed-in user's own repo, or the organization
 * they switched into. Destructive actions are gated by the CGS role before
 * they are offered: personal repos always may, group members need owner or
 * admin (the same rule the profile page resolves server-side).
 */

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import {
  useAccountList,
  useActingRepo,
  useActiveAccountContext,
} from "@/app/_lib/account-switcher";
import { AccountAudioViewer } from "@/app/account/[did]/audio/AccountAudioViewer";

export function LibraryTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.library");
  const acting = useActingRepo(sessionDid);
  const [activeContext] = useActiveAccountContext(sessionDid ?? "");
  const { groups } = useAccountList(sessionDid);

  /* Acting as an organization: mutations target the group repo and the
     available actions depend on the user's role in that group. */
  const isGroup = Boolean(acting.repo);
  const canDelete = useMemo(() => {
    if (!isGroup) return true;
    const role =
      groups.find((group) => group.groupDid === acting.did)?.role ??
      (activeContext.type === "group" ? activeContext.role : undefined) ??
      "member";
    return canDeleteRecord({ kind: "group", role }).allowed;
  }, [acting.did, activeContext, groups, isGroup]);

  if (!sessionDid || !acting.did) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <h2 className="text-base font-medium text-foreground">{t("signInTitle")}</h2>
        <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{t("signInBody")}</p>
      </div>
    );
  }

  return (
    <AccountAudioViewer
      /* Switching accounts resets selection and reloads the listing. */
      key={acting.did}
      did={acting.did}
      showUploadCta={!isGroup}
      canDelete={canDelete}
      mutationRepo={acting.repo ?? null}
      embedded
    />
  );
}
