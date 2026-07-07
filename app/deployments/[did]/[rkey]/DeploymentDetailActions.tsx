"use client";

/**
 * Owner-only actions on the deployment detail page: edit (name + linked
 * AudioMoth) and delete. Edit refreshes the server page; delete returns to
 * the AudioMoth Deployment tab.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteDeploymentEvent, type DeploymentEventItem } from "@/app/_lib/deployment-events";
import { EditDeploymentDialog } from "@/app/audiomoth/_components/deployment-shared";

export function DeploymentDetailActions({
  event,
  sessionDid,
}: {
  event: DeploymentEventItem;
  sessionDid: string;
}) {
  const t = useTranslations("common.audiomoth.deployments");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setDeleting(true);
    try {
      await deleteDeploymentEvent(event);
      router.push("/audiomoth?tab=deployments");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("deleteFailed"));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {confirming ? (
          <>
            <Button variant="destructive" size="sm" onClick={remove} disabled={deleting}>
              {deleting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {t("confirmDelete")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon className="size-4" />
              {t("edit")}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(true)}
              aria-label={t("delete")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </>
        )}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {editing ? (
        <EditDeploymentDialog
          sessionDid={sessionDid}
          event={event}
          onClose={() => setEditing(false)}
          onUpdated={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
