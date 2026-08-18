"use client";

/**
 * The Audio hub's Recordings tab: every folder and recording the acting
 * account has uploaded, in one browsable place, plus the "Create deployment"
 * chime flow that used to sit on a tab of its own. Recordings and
 * deployments are two views of the same field work — the recordings are
 * grouped by the deployment that captured them — so setting up a new
 * AudioMoth and browsing what deployed ones brought back happen here
 * together.
 *
 * The recordings browser embeds the exact same viewer the profile's Audio
 * tab uses (AccountAudioViewer) — folders with rename / move / delete, and
 * the spectrogram player per recording — so the two surfaces can never
 * drift apart.
 *
 * The acting account is the signed-in user's own repo, or the organization
 * they switched into. Destructive actions are gated by the CGS role before
 * they are offered: personal repos always may, group members need owner or
 * admin (the same rule the profile page resolves server-side).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AudioLinesIcon, CheckIcon, Loader2Icon, PlusIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canDeleteRecord } from "@/app/(manage)/manage/_lib/cgs-permissions";
import {
  useAccountList,
  useActingRepo,
  useActiveAccountContext,
} from "@/app/_lib/account-switcher";
import { useUploadTrayOptional } from "@/app/_components/upload-tray/upload-tray-context";
import { AccountAudioViewer } from "@/app/account/[did]/audio/AccountAudioViewer";
import { CreateDeploymentDialog } from "./deployment-shared";

/** Where the "set one up ↗" hand-off from the Add observations modal stands. */
type AttachState =
  | { phase: "waiting" }
  | { phase: "attaching" }
  | { phase: "done"; moved: number; failed: number }
  | { phase: "failed" };

export function LibraryTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.library");
  const tDeployments = useTranslations("common.audiomoth.deployments");
  const tRecordings = useTranslations("common.audiomoth.recordings");
  const acting = useActingRepo(sessionDid);
  const [activeContext] = useActiveAccountContext(sessionDid ?? "");
  const { groups } = useAccountList(sessionDid);

  const [creating, setCreating] = useState(false);
  /* Bumped when a deployment is created here, so the viewer refetches and
     the new (still empty) deployment appears in the list right away. */
  const [refreshToken, setRefreshToken] = useState(0);

  /* Counts for the overview card's header, reported by the viewer below
     once its listing loads. Cleared on account switches so one account's
     numbers never sit above another account's list. */
  const [stats, setStats] = useState<{ deploymentCount: number; recordingCount: number } | null>(null);
  useEffect(() => setStats(null), [acting.did]);

  // "Set one up ↗" from the Add observations modal: the batch is already
  // uploading in the background tray; it attaches to the deployment created
  // here the moment it exists.
  const searchParams = useSearchParams();
  const uploadTray = useUploadTrayOptional();
  const attachBatchKey = searchParams.get("attachBatch");
  const attachCountParam = Number(searchParams.get("attachCount") ?? "");
  const [attachState, setAttachState] = useState<AttachState>({ phase: "waiting" });
  const attachInfo = attachBatchKey ? (uploadTray?.batchInfo(attachBatchKey) ?? null) : null;
  // The tray forgets a batch on dismiss/reload; the count in the URL keeps
  // the pill honest until the deployment is created.
  const attachTotal = attachInfo?.total || (Number.isFinite(attachCountParam) ? attachCountParam : 0);
  const showAttachPill = Boolean(attachBatchKey) && attachTotal > 0;

  /** The dialog created its companion ac.deployment — attach the batch to it. */
  const attachBatchTo = useCallback(
    (acDeploymentUri: string | null) => {
      if (!attachBatchKey || !uploadTray || !acDeploymentUri) return;
      if (attachState.phase === "attaching" || attachState.phase === "done") return;
      setAttachState({ phase: "attaching" });
      uploadTray
        .retargetBatch(attachBatchKey, { kind: "existing", uri: acDeploymentUri })
        .then(({ moved, failed }) => setAttachState({ phase: "done", moved, failed }))
        .catch(() => setAttachState({ phase: "failed" }));
    },
    [attachBatchKey, attachState.phase, uploadTray],
  );

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
    <div className="mt-6 flex flex-col gap-6">
      {showAttachPill ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <p className="flex min-w-0 items-center gap-2.5 text-sm text-foreground">
            {attachState.phase === "attaching" ? (
              <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />
            ) : attachState.phase === "done" ? (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            ) : (
              <AudioLinesIcon className="size-4 shrink-0 text-primary" />
            )}
            <span>
              {attachState.phase === "done"
                ? attachState.failed > 0
                  ? tDeployments("attachPartial", { moved: attachState.moved, failed: attachState.failed })
                  : tDeployments("attachDone", { count: attachTotal })
                : attachState.phase === "attaching"
                  ? tDeployments("attaching", { count: attachTotal })
                  : attachState.phase === "failed"
                    ? tDeployments("attachFailed")
                    : tDeployments("attachWaiting", { count: attachTotal })}
            </span>
          </p>
          {attachState.phase === "waiting" || attachState.phase === "failed" ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              {tDeployments("createButton")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Deployments overview — the same card language as the folder
          sections below it, so the chime flow reads as part of the listing
          it feeds: a deployment made here appears below as an empty folder
          awaiting its first card. */}
      <section className="rounded-2xl border border-border bg-card/90 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-base font-medium text-foreground">
              {tDeployments("sectionTitle")}
              {stats ? (
                <span className="text-sm font-normal text-muted-foreground">
                  {tDeployments("deploymentCount", { count: stats.deploymentCount })}
                  {" · "}
                  {tRecordings("groupCount", { count: stats.recordingCount })}
                </span>
              ) : null}
            </h2>
            <p className="mt-1.5 max-w-prose text-sm leading-6 text-muted-foreground">{tDeployments("intro")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* The personal SD-card upload flow — organizations upload through
                the Add observations modal instead. */}
            {!isGroup ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/observations/audio?tab=upload">
                  <UploadIcon className="size-4" />
                  {tRecordings("uploadCta")}
                </Link>
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              {tDeployments("createButton")}
            </Button>
          </div>
        </div>
      </section>

      <AccountAudioViewer
        /* Switching accounts (or creating a deployment) resets selection and
           reloads the listing. */
        key={`${acting.did}:${refreshToken}`}
        did={acting.did}
        showUploadCta={!isGroup}
        canDelete={canDelete}
        mutationRepo={acting.repo ?? null}
        /* Deployments are created right here, so every empty one must show —
           even for org members whose role hides the clean-up actions. */
        showEmptyDeployments
        onStats={setStats}
        embedded
      />

      {creating ? (
        <CreateDeploymentDialog
          sessionDid={sessionDid}
          repoDid={showAttachPill && attachInfo?.repoDid ? attachInfo.repoDid : (acting.repo ?? null)}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setRefreshToken((value) => value + 1);
            if (showAttachPill) attachBatchTo(created.acDeploymentUri);
          }}
        />
      ) : null}
    </div>
  );
}
