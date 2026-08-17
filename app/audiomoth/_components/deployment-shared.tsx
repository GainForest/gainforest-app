"use client";

/**
 * Shared bits for editing AudioMoth deployments: the org-wide AudioMoth
 * picker (used by both the create and edit dialogs) and the edit dialog
 * itself (used by the Deployment tab list and the deployment detail page).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  applyDeploymentEdit,
  linkedEquipmentUri,
  updateDeploymentEvent,
  type DeploymentEventEdit,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import { renameCompanionFolder } from "@/app/_lib/unified-deployments";
import { listEquipment, type EquipmentItem } from "@/app/_lib/equipment";
import { formatRelative } from "@/app/_lib/format";

/**
 * The AudioMoths registered in one account's equipment list — the repo a
 * deployment is created into or lives in. Like the rest of the audio surface,
 * the picker follows the account being acted for rather than aggregating
 * every organization the viewer belongs to: acting as an organization offers
 * the organization's recorders, acting personally offers your own.
 */
export function useMyAudioMoths(did: string | null): { equipment: EquipmentItem[] | null } {
  const [equipment, setEquipment] = useState<EquipmentItem[] | null>(null);

  useEffect(() => {
    if (!did) {
      setEquipment([]);
      return;
    }
    setEquipment(null);
    const ctrl = new AbortController();
    listEquipment(did, ctrl.signal)
      .then((items) => {
        if (!ctrl.signal.aborted) setEquipment(items.filter((item) => item.category === "audiomoth"));
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setEquipment([]);
      });
    return () => ctrl.abort();
  }, [did]);

  return { equipment };
}

/** Label for one AudioMoth in the picker. The list is always one account's
 *  own units, so no owner suffix is needed. */
export function audioMothOptionLabel(item: EquipmentItem): string {
  return item.assetId ? `${item.name} (${item.assetId})` : item.name;
}

/**
 * Change only the name and the linked AudioMoth of an existing deployment.
 * The chime identity — deployment ID, coordinates and date — was fixed the
 * moment the chime was played, so it is shown read-only.
 */
export function EditDeploymentDialog({
  sessionDid,
  event,
  onClose,
  onUpdated,
}: {
  sessionDid: string;
  event: DeploymentEventItem;
  onClose: () => void;
  onUpdated: (updated: DeploymentEventItem) => void;
}) {
  const t = useTranslations("common.audiomoth.deployments");
  // The picker lists the units of the repo the deployment lives in — the
  // org's when editing an org deployment, the owner's own otherwise.
  const { equipment } = useMyAudioMoths(event.did);

  const currentUri = linkedEquipmentUri(event.eventRemarks);
  const [siteName, setSiteName] = useState(event.locality ?? "");
  const [equipmentUri, setEquipmentUri] = useState<string>(currentUri ?? "none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose, saving]);

  // The linked unit may live in a teammate's repo we can't currently read; keep
  // it selectable so saving doesn't silently drop the existing link.
  const currentInList = equipment?.some((item) => item.uri === currentUri) ?? false;
  const showOrphanLinkOption = Boolean(currentUri) && equipment !== null && !currentInList;

  const coords =
    event.decimalLatitude && event.decimalLongitude
      ? `${Number(event.decimalLatitude).toFixed(5)}, ${Number(event.decimalLongitude).toFixed(5)}`
      : "\u2014";

  const save = useCallback(async () => {
    setError(null);
    let equipmentLink: DeploymentEventEdit["equipment"] = null;
    if (equipmentUri !== "none") {
      const picked = equipment?.find((item) => item.uri === equipmentUri) ?? null;
      if (picked) {
        equipmentLink = { name: picked.name, assetId: picked.assetId, uri: picked.uri };
      } else if (equipmentUri === currentUri) {
        // Keep the existing (unreadable) link, preserving its shown label.
        equipmentLink = { name: event.equipmentUsed ?? "AudioMoth", assetId: "", uri: currentUri };
      }
    }
    const edit: DeploymentEventEdit = { siteName, equipment: equipmentLink };
    setSaving(true);
    try {
      // A record outside the signed-in repo lives in an organization's —
      // write it there (CGS checks membership server-side).
      const repoOption = event.did !== sessionDid ? { repo: event.did } : undefined;
      const { cid } = await updateDeploymentEvent(event, edit, repoOption);
      // One deployment, one name: the folder its recordings are filed under
      // gets the same name, so the audio library and the upload picker never
      // show a stale one. Best-effort — the next rename re-syncs the pair.
      if (siteName.trim() && siteName.trim() !== (event.locality ?? "")) {
        try {
          await renameCompanionFolder(event, siteName.trim(), repoOption);
        } catch (syncError) {
          console.warn("[deployments] folder rename sync failed", syncError);
        }
      }
      onUpdated(applyDeploymentEdit(event, edit, cid));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("updateFailed"));
      setSaving(false);
    }
  }, [currentUri, equipment, equipmentUri, event, onUpdated, sessionDid, siteName, t]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => !saving && onClose()} />
      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-foreground">{t("editTitle")}</h2>
          <Button variant="ghost" size="icon-sm" onClick={() => !saving && onClose()} aria-label={t("close")}>
            <XIcon />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-sm text-muted-foreground">{t("editIntro")}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-site-name">{t("siteNameLabel")}</Label>
            <Input
              id="edit-site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t("siteNamePlaceholder")}
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-equipment">{t("equipmentLabel")}</Label>
            <Select value={equipmentUri} onValueChange={setEquipmentUri} disabled={saving}>
              <SelectTrigger id="edit-equipment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("equipmentNone")}</SelectItem>
                {showOrphanLinkOption ? (
                  <SelectItem value={currentUri!}>{event.equipmentUsed ?? t("equipmentLinked")}</SelectItem>
                ) : null}
                {(equipment ?? []).map((item) => (
                  <SelectItem key={item.uri} value={item.uri}>
                    {audioMothOptionLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {equipment !== null && equipment.length === 0 ? t("equipmentEmpty") : t("equipmentHint")}
            </p>
          </div>

          {/* Fixed to the chime that was played — shown for reference only. */}
          <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("fixedTitle")}</p>
            <dl className="mt-2 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("deploymentIdLabel")}</dt>
                <dd className="truncate font-mono text-foreground">{event.eventID}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("coordinatesLabel")}</dt>
                <dd className="font-mono text-foreground">{coords}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("deployedLabel")}</dt>
                <dd className="text-foreground">{formatRelative(event.eventDate)}</dd>
              </div>
            </dl>
          </div>

          {error ? (
            <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-2 border-t border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
          <Button variant="outline" size="sm" onClick={() => !saving && onClose()} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
