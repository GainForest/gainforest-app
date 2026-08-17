"use client";

/**
 * Shared bits for AudioMoth deployment dialogs: the org-wide AudioMoth
 * picker, the create dialog (used by the Recordings tab, where — like the
 * GainForest Android app — it generates the acoustic chime for the chosen
 * location and plays it against the AudioMoth's microphone) and the edit
 * dialog (used by the deployment detail page).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  CheckIcon,
  Loader2Icon,
  LocateFixedIcon,
  RefreshCwIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  generateChime,
  isValidDeploymentId,
  playChime,
  randomDeploymentIdHex,
} from "@/app/_lib/audiomoth/chime";
import {
  applyDeploymentEdit,
  createDeploymentEvent,
  linkedEquipmentUri,
  updateDeploymentEvent,
  type DeploymentEventEdit,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import { createAcDeployment } from "@/app/_lib/ac-deployment";
import { renameCompanionFolder } from "@/app/_lib/unified-deployments";
import { loadAppliedConfig } from "@/app/_lib/audiomoth/setup-store";
import { equipmentDetailPath, listEquipment, type EquipmentItem } from "@/app/_lib/equipment";
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

/* ------------------------------------------------------------------ */
/* Create deployment dialog                                            */
/* ------------------------------------------------------------------ */

type CreateStage = "form" | "playing" | "done";

export function CreateDeploymentDialog({
  sessionDid,
  repoDid = null,
  onClose,
  onCreated,
}: {
  sessionDid: string;
  /**
   * Repo the deployment event and its companion `ac.deployment` land in —
   * an organization's DID when acting as one (or when a pending attach-batch
   * was uploaded for one, so the batch and its deployment end up in the same
   * repo). Null = the signed-in user's own.
   */
  repoDid?: string | null;
  onClose: () => void;
  /** Reports the companion recorder-deployment record, when it could be saved. */
  onCreated: (created: { acDeploymentUri: string | null }) => void;
}) {
  const t = useTranslations("common.audiomoth.deployments");

  const [siteName, setSiteName] = useState("");
  const [deploymentId, setDeploymentId] = useState(() => randomDeploymentIdHex());
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [locating, setLocating] = useState(false);
  // Offer the recorders of the repo this deployment will be created into —
  // the organization's when acting as one, the user's own otherwise.
  const { equipment } = useMyAudioMoths(repoDid ?? sessionDid);
  const [equipmentUri, setEquipmentUri] = useState<string>("none");
  const [stage, setStage] = useState<CreateStage>("form");
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = stage === "playing" || replaying;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [busy, onClose]);

  const selectedEquipment = useMemo(
    () => equipment?.find((item) => item.uri === equipmentUri) ?? null,
    [equipment, equipmentUri],
  );

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError(t("locationUnavailable"));
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLon(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError(t("locationUnavailable"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [t]);

  function parseCoords(): { lat: number; lon: number } | null {
    const latN = Number(lat.trim());
    const lonN = Number(lon.trim());
    if (
      !lat.trim() ||
      !lon.trim() ||
      !Number.isFinite(latN) ||
      !Number.isFinite(lonN) ||
      latN < -90 ||
      latN > 90 ||
      lonN < -180 ||
      lonN > 180
    ) {
      return null;
    }
    return { lat: latN, lon: lonN };
  }

  /** Validate → save the event record → play the chime. */
  const createAndPlay = useCallback(async () => {
    setError(null);
    if (!isValidDeploymentId(deploymentId)) {
      setError(t("invalidId"));
      return;
    }
    const coords = parseCoords();
    if (!coords) {
      setError(t("invalidCoordinates"));
      return;
    }
    setStage("playing");
    try {
      const now = new Date();
      const id = deploymentId.trim().toLowerCase();
      // Save first — even if the speaker fails, the generated ID is preserved.
      const eventResult = await createDeploymentEvent(
        {
          deploymentIdHex: id,
          siteName,
          lat: coords.lat,
          lon: coords.lon,
          deployedAt: now,
          equipment: selectedEquipment
            ? { name: selectedEquipment.name, assetId: selectedEquipment.assetId, uri: selectedEquipment.uri }
            : null,
        },
        repoDid ? { repo: repoDid } : undefined,
      );
      // Companion recorder-deployment record (ac.deployment) carrying the
      // device configuration this browser last wrote to the unit. Best
      // effort — the chime event above is the source of truth for the ID.
      // A pending attach-batch grabs this record's URI the moment it exists.
      let acDeploymentUri: string | null = null;
      try {
        const applied = selectedEquipment ? loadAppliedConfig(selectedEquipment.assetId) : null;
        const acResult = await createAcDeployment(
          {
            name: siteName.trim() || `AudioMoth ${id}`,
            deployedAt: now,
            lat: coords.lat,
            lon: coords.lon,
            eventUri: eventResult.uri,
            equipment: selectedEquipment
              ? { name: selectedEquipment.name, assetId: selectedEquipment.assetId, uri: selectedEquipment.uri }
              : null,
            config: applied?.config ?? null,
            firmwareVersion: applied?.firmwareVersion ?? null,
            remarks: `Chime deployment ID ${id}.`,
          },
          repoDid ? { repo: repoDid } : undefined,
        );
        acDeploymentUri = acResult.uri;
      } catch (acError) {
        console.warn("ac.deployment companion record could not be saved", acError);
      }
      onCreated({ acDeploymentUri });
      const samples = generateChime(Math.floor(now.getTime() / 1000), coords.lat, coords.lon, id);
      await playChime(samples);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("createFailed"));
      setStage("form");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseCoords reads lat/lon state
  }, [deploymentId, lat, lon, onCreated, repoDid, selectedEquipment, siteName, t]);

  /** Replay the chime for the current moment (the record stays as saved). */
  const replay = useCallback(async () => {
    const coords = parseCoords();
    if (!coords) return;
    setReplaying(true);
    setError(null);
    try {
      const samples = generateChime(
        Math.floor(Date.now() / 1000),
        coords.lat,
        coords.lon,
        deploymentId.trim().toLowerCase(),
      );
      await playChime(samples);
    } catch {
      setError(t("playFailed"));
    } finally {
      setReplaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseCoords reads lat/lon state
  }, [deploymentId, lat, lon, t]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-full w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-foreground">{t("createTitle")}</h2>
          <Button variant="ghost" size="icon-sm" onClick={() => !busy && onClose()} aria-label={t("close")}>
            <XIcon />
          </Button>
        </div>

        {stage === "done" ? (
          <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
              <CheckIcon className="size-6" />
            </span>
            <div>
              <p className="text-base font-medium text-foreground">{t("doneTitle")}</p>
              <p className="mx-auto mt-1 max-w-[340px] text-sm text-muted-foreground">{t("doneBody")}</p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={replay} disabled={replaying}>
                {replaying ? <Loader2Icon className="size-4 animate-spin" /> : <Volume2Icon className="size-4" />}
                {t("playAgain")}
              </Button>
              <Button size="sm" onClick={onClose}>
                {t("done")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 px-5 py-5">
              <p className="text-sm text-muted-foreground">{t("createIntro")}</p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deploy-site-name">{t("siteNameLabel")}</Label>
                <Input
                  id="deploy-site-name"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder={t("siteNamePlaceholder")}
                  disabled={busy}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deploy-id">{t("deploymentIdLabel")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="deploy-id"
                    value={deploymentId}
                    onChange={(e) => setDeploymentId(e.target.value)}
                    className="font-mono"
                    disabled={busy}
                  />
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setDeploymentId(randomDeploymentIdHex())}
                    aria-label={t("newId")}
                    disabled={busy}
                  >
                    <RefreshCwIcon className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deploy-lat">{t("latitudeLabel")}</Label>
                  <Input
                    id="deploy-lat"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="-1.234567"
                    className="font-mono"
                    disabled={busy}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="deploy-lon">{t("longitudeLabel")}</Label>
                  <Input
                    id="deploy-lon"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    placeholder="-77.891234"
                    className="font-mono"
                    disabled={busy}
                  />
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={useCurrentLocation} disabled={busy || locating}>
                {locating ? <Loader2Icon className="size-4 animate-spin" /> : <LocateFixedIcon className="size-4" />}
                {t("useLocation")}
              </Button>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deploy-equipment">{t("equipmentLabel")}</Label>
                <Select value={equipmentUri} onValueChange={setEquipmentUri} disabled={busy}>
                  <SelectTrigger id="deploy-equipment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("equipmentNone")}</SelectItem>
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

              {selectedEquipment ? (
                <p className="text-xs text-muted-foreground">
                  <Link
                    href={equipmentDetailPath(selectedEquipment.did, selectedEquipment.rkey)}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {t("viewSelectedEquipment")}
                  </Link>
                </p>
              ) : null}

              {error ? (
                <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
              ) : null}

              <p className={cn("text-xs text-muted-foreground", stage === "playing" && "text-primary")}>
                {stage === "playing" ? t("playing") : t("chimeHint")}
              </p>
            </div>

            <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-2 border-t border-border bg-background/95 px-5 py-4 backdrop-blur-xl">
              <Button variant="outline" size="sm" onClick={() => !busy && onClose()} disabled={busy}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={createAndPlay} disabled={busy}>
                {stage === "playing" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Volume2Icon className="size-4" />
                )}
                {stage === "playing" ? t("playing") : t("playAndSave")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
