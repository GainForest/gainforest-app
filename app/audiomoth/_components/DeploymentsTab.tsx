"use client";

/**
 * The AudioMoth page's Deployment tab: the list of `app.gainforest.dwc.event`
 * deployment records in the signed-in user's repo, plus a "Create deployment"
 * dialog that — like the GainForest Android app — generates the acoustic
 * chime for the chosen location, plays it against the AudioMoth's microphone
 * and saves the deployment event, optionally linked to a unit from the
 * user's equipment list.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  LocateFixedIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
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
  deleteDeploymentEvent,
  linkedEquipmentUri,
  listDeploymentEvents,
  updateDeploymentEvent,
  type DeploymentEventEdit,
  type DeploymentEventItem,
} from "@/app/_lib/deployment-events";
import { equipmentDetailPath, type EquipmentItem } from "@/app/_lib/equipment";
import { resolveDidProfile, type DidProfile } from "@/app/_lib/did-profile";
import { formatRelative, shortDid } from "@/app/_lib/format";

/** Your AudioMoths, aggregated across every organization you belong to. */
async function fetchMyAudioMoths(signal?: AbortSignal): Promise<EquipmentItem[]> {
  const res = await fetch("/api/audiomoth/equipment", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load equipment (${res.status}).`);
  const data = (await res.json()) as { equipment?: EquipmentItem[] };
  return Array.isArray(data.equipment) ? data.equipment : [];
}

/**
 * Load the viewer's AudioMoths (org-wide) plus the display names of any units
 * held by teammates, so the picker can disambiguate whose unit is whose.
 * Shared by the create and edit dialogs.
 */
function useMyAudioMoths(sessionDid: string): {
  equipment: EquipmentItem[] | null;
  ownerProfiles: Record<string, DidProfile>;
} {
  const [equipment, setEquipment] = useState<EquipmentItem[] | null>(null);
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, DidProfile>>({});

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMyAudioMoths(ctrl.signal)
      .then((items) => {
        if (ctrl.signal.aborted) return;
        setEquipment(items);
        const others = [...new Set(items.map((item) => item.did))].filter((did) => did !== sessionDid);
        for (const did of others) {
          resolveDidProfile(did)
            .then((profile) => {
              if (!ctrl.signal.aborted) {
                setOwnerProfiles((prev) => (prev[did] ? prev : { ...prev, [did]: profile }));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setEquipment([]);
      });
    return () => ctrl.abort();
  }, [sessionDid]);

  return { equipment, ownerProfiles };
}

/** Label for one AudioMoth in the picker, suffixed with the owner when it
 *  belongs to a teammate/organization rather than the viewer. */
function audioMothOptionLabel(
  item: EquipmentItem,
  sessionDid: string,
  ownerProfiles: Record<string, DidProfile>,
): string {
  const base = item.assetId ? `${item.name} (${item.assetId})` : item.name;
  if (item.did === sessionDid) return base;
  const owner =
    ownerProfiles[item.did]?.displayName || ownerProfiles[item.did]?.handle || shortDid(item.did);
  return `${base} \u2014 ${owner}`;
}

export function DeploymentsTab({ sessionDid }: { sessionDid: string | null }) {
  const t = useTranslations("common.audiomoth.deployments");

  const [events, setEvents] = useState<DeploymentEventItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DeploymentEventItem | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!sessionDid) return;
      setLoadError(false);
      try {
        const list = await listDeploymentEvents(sessionDid, signal);
        if (!signal?.aborted) setEvents(list);
      } catch (err) {
        if (signal?.aborted || (err as Error).name === "AbortError") return;
        setEvents([]);
        setLoadError(true);
      }
    },
    [sessionDid],
  );

  useEffect(() => {
    if (!sessionDid) return;
    const ctrl = new AbortController();
    void reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload, sessionDid]);

  if (!sessionDid) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
        <h2 className="text-base font-medium text-foreground">{t("signInTitle")}</h2>
        <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{t("signInBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">{t("intro")}</p>
        <Button size="sm" onClick={() => setCreating(true)} className="shrink-0">
          <PlusIcon className="size-4" />
          {t("createButton")}
        </Button>
      </div>

      {events === null ? (
        <LoadingRows />
      ) : loadError ? (
        <Notice title={t("loadErrorTitle")} body={t("loadError")} />
      ) : events.length === 0 ? (
        <Notice title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <DeploymentRow
              key={event.uri}
              event={event}
              onEdit={() => setEditing(event)}
              onDeleted={() => {
                setEvents((current) => current?.filter((e) => e.uri !== event.uri) ?? null);
              }}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <EditDeploymentDialog
          sessionDid={sessionDid}
          event={editing}
          onClose={() => setEditing(null)}
          onUpdated={(updated) => {
            setEvents((current) => current?.map((e) => (e.uri === updated.uri ? updated : e)) ?? null);
            setEditing(null);
          }}
        />
      ) : null}

      {creating ? (
        <CreateDeploymentDialog
          sessionDid={sessionDid}
          onClose={() => setCreating(false)}
          onCreated={() => void reload()}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Deployment list row                                                 */
/* ------------------------------------------------------------------ */

function DeploymentRow({
  event,
  onEdit,
  onDeleted,
}: {
  event: DeploymentEventItem;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("common.audiomoth.deployments");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coords =
    event.decimalLatitude && event.decimalLongitude
      ? `${Number(event.decimalLatitude).toFixed(4)}, ${Number(event.decimalLongitude).toFixed(4)}`
      : null;

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(event.eventID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [event.eventID]);

  const remove = useCallback(async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteDeploymentEvent(event);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("deleteFailed"));
      setDeleting(false);
      setConfirming(false);
    }
  }, [event, onDeleted, t]);

  return (
    <li className="rounded-2xl border border-border bg-card/90 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <MapPinIcon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {event.locality ?? t("untitled")}
          </p>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <span className="truncate">{event.eventID}</span>
            <button
              type="button"
              onClick={copyId}
              aria-label={t("copyId")}
              className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              {copied ? <CheckIcon className="size-3.5 text-primary" /> : <CopyIcon className="size-3.5" />}
            </button>
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[coords, formatRelative(event.eventDate), event.equipmentUsed].filter(Boolean).join(" · ")}
          </p>
          {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {confirming ? (
            <>
              <Button variant="destructive" size="xs" onClick={remove} disabled={deleting}>
                {deleting ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                {t("confirmDelete")}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(false)} disabled={deleting}>
                {t("cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={onEdit}
                aria-label={t("edit")}
              >
                <PencilIcon className="size-4" />
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
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Create deployment dialog                                            */
/* ------------------------------------------------------------------ */

type CreateStage = "form" | "playing" | "done";

function CreateDeploymentDialog({
  sessionDid,
  onClose,
  onCreated,
}: {
  sessionDid: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("common.audiomoth.deployments");

  const [siteName, setSiteName] = useState("");
  const [deploymentId, setDeploymentId] = useState(() => randomDeploymentIdHex());
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [locating, setLocating] = useState(false);
  const { equipment, ownerProfiles } = useMyAudioMoths(sessionDid);
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
      await createDeploymentEvent({
        deploymentIdHex: id,
        siteName,
        lat: coords.lat,
        lon: coords.lon,
        deployedAt: now,
        equipment: selectedEquipment
          ? { name: selectedEquipment.name, assetId: selectedEquipment.assetId, uri: selectedEquipment.uri }
          : null,
      });
      onCreated();
      const samples = generateChime(Math.floor(now.getTime() / 1000), coords.lat, coords.lon, id);
      await playChime(samples);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("createFailed"));
      setStage("form");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseCoords reads lat/lon state
  }, [deploymentId, lat, lon, onCreated, selectedEquipment, siteName, t]);

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
                        {audioMothOptionLabel(item, sessionDid, ownerProfiles)}
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

/* ------------------------------------------------------------------ */
/* Edit deployment dialog                                              */
/* ------------------------------------------------------------------ */

/**
 * Change only the name and the linked AudioMoth of an existing deployment.
 * The chime identity — deployment ID, coordinates and date — was fixed the
 * moment the chime was played, so it is shown read-only.
 */
function EditDeploymentDialog({
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
  const { equipment, ownerProfiles } = useMyAudioMoths(sessionDid);

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
      : "—";

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
      const { cid } = await updateDeploymentEvent(event, edit);
      onUpdated(applyDeploymentEdit(event, edit, cid));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("updateFailed"));
      setSaving(false);
    }
  }, [currentUri, equipment, equipmentUri, event, onUpdated, siteName, t]);

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
                    {audioMothOptionLabel(item, sessionDid, ownerProfiles)}
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

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 last:border-0">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[420px] text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
