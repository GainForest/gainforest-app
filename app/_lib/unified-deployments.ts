/**
 * One deployment, whichever way it came into the account.
 *
 * Two records can stand behind a deployment:
 *
 *   - `app.gainforest.ac.deployment` — the record recordings are filed under
 *     (created by uploading an SD card, or as the companion of a chime), and
 *   - `app.gainforest.dwc.event` — the acoustic chime played in the field
 *     (from this app's Deployments tab or the GainForest Android app).
 *
 * A chime always belongs to one deployment; it is how recordings identify
 * where they came from, not a thing in its own right. This module joins the
 * two collections so every surface — the audio library, the upload
 * destination pickers, the move dialog — shows each deployment exactly once:
 *
 *   - a folder record with `eventRef` and its chime event are ONE deployment;
 *   - a chime event with no folder record yet (the Android app writes none,
 *     and neither did older versions of this app) is still a deployment, and
 *     recordings sent to it create the folder record on first use;
 *   - renaming a deployment renames BOTH records, so the Deployments tab and
 *     the audio library never drift apart.
 */

import {
  applyAcDeploymentEdit,
  listAcDeployments,
  updateAcDeployment,
  type AcDeploymentDraft,
  type AcDeploymentItem,
} from "./ac-deployment";
import {
  applyDeploymentEdit,
  deploymentDetailPath,
  DWC_EVENT_COLLECTION,
  linkedEquipmentUri,
  listDeploymentEvents,
  parseAtUri,
  updateDeploymentEvent,
  type DeploymentEventEdit,
  type DeploymentEventItem,
} from "./deployment-events";

/** One deployment as the app shows it, with the record(s) standing behind it. */
export type UnifiedDeployment = {
  /**
   * Selection value for pickers: the folder record's URI when one exists
   * (recordings can be filed under it directly), otherwise the chime event's
   * URI (filing under it creates the folder record on first use).
   */
  uri: string;
  name: string;
  deployedAt: string | null;
  /** The record recordings are filed under — null until something is uploaded. */
  folder: AcDeploymentItem | null;
  /** The acoustic chime played in the field — null for upload-only deployments. */
  event: DeploymentEventItem | null;
  /** Local path of the deployment's detail page, when it has a chime. */
  detailPath: string | null;
};

/** The name a chime deployment goes by before anyone has named it. */
export function chimeDeploymentName(event: DeploymentEventItem): string {
  return event.locality ?? `AudioMoth ${event.eventID}`;
}

/** True when a picker value points at a chime event rather than a folder record. */
export function isChimeEventUri(uri: string): boolean {
  return parseAtUri(uri)?.collection === DWC_EVENT_COLLECTION;
}

/**
 * Join folder records and chime events into one list with each deployment
 * exactly once: every folder (carrying its chime when `eventRef` finds one),
 * then every chime no folder points at. Newest first, like both source lists.
 */
export function unifyDeployments(
  folders: AcDeploymentItem[],
  events: DeploymentEventItem[],
): UnifiedDeployment[] {
  const byEventUri = new Map(events.map((event) => [event.uri, event]));
  const claimed = new Set<string>();
  const list: UnifiedDeployment[] = [];

  for (const folder of folders) {
    let event: DeploymentEventItem | null = null;
    if (folder.eventRef && !claimed.has(folder.eventRef)) {
      event = byEventUri.get(folder.eventRef) ?? null;
      if (event) claimed.add(folder.eventRef);
    }
    const eventParts = folder.eventRef ? parseAtUri(folder.eventRef) : null;
    list.push({
      uri: folder.uri,
      name: folder.name,
      deployedAt: folder.deployedAt ?? null,
      folder,
      event,
      detailPath: eventParts ? deploymentDetailPath(eventParts.did, eventParts.rkey) : null,
    });
  }

  for (const event of events) {
    if (claimed.has(event.uri)) continue;
    list.push({
      uri: event.uri,
      name: chimeDeploymentName(event),
      deployedAt: event.eventDate ?? null,
      folder: null,
      event,
      detailPath: deploymentDetailPath(event.did, event.rkey),
    });
  }

  list.sort((a, b) => (b.deployedAt ?? "").localeCompare(a.deployedAt ?? ""));
  return list;
}

/** Fetch both collections of a repo and join them. */
export async function listUnifiedDeployments(
  did: string,
  signal?: AbortSignal,
): Promise<UnifiedDeployment[]> {
  const [folders, events] = await Promise.all([
    listAcDeployments(did, signal),
    // The chime list is additive — losing it must not hide uploaded folders.
    listDeploymentEvents(did, signal).catch(() => [] as DeploymentEventItem[]),
  ]);
  return unifyDeployments(folders, events);
}

/**
 * The folder record a chime deployment gets the first time recordings are
 * filed under it — named, placed and dated by the chime, and linked back to
 * it so the pair stays one deployment. Shared by every surface that creates
 * the folder on first use (the upload tray, moving recordings).
 */
export function companionFolderDraft(event: DeploymentEventItem, remarks: string): AcDeploymentDraft {
  return {
    name: chimeDeploymentName(event),
    deployedAt: new Date(event.eventDate),
    lat: event.decimalLatitude ? Number(event.decimalLatitude) : undefined,
    lon: event.decimalLongitude ? Number(event.decimalLongitude) : undefined,
    eventUri: event.uri,
    remarks,
  };
}

/**
 * The edit that renames a chime event and nothing else. The equipment link
 * lives inside the same editable fields, so it is carried over explicitly —
 * passing `null` would silently unlink the recorder.
 */
export function eventRenameEdit(event: DeploymentEventItem, name: string): DeploymentEventEdit {
  const equipmentUri = linkedEquipmentUri(event.eventRemarks);
  return {
    siteName: name,
    equipment: equipmentUri
      ? { name: event.equipmentUsed ?? "AudioMoth", assetId: "", uri: equipmentUri }
      : null,
  };
}

/** The edit that overrides a chime event's location and nothing else — name
 *  and equipment link are carried over explicitly, like a rename. */
function eventLocationEdit(
  event: DeploymentEventItem,
  location: { lat: number; lon: number },
): DeploymentEventEdit {
  const equipmentUri = linkedEquipmentUri(event.eventRemarks);
  return {
    siteName: event.locality ?? "",
    equipment: equipmentUri
      ? { name: event.equipmentUsed ?? "AudioMoth", assetId: "", uri: equipmentUri }
      : null,
    location,
  };
}

/**
 * Manually override where a deployment stood — the fix for folders that came
 * in by uploading past SD-card audio, which carry no coordinates at all.
 *
 * One deployment, one location: the override is written to every record
 * standing behind it, so the audio library, the labeling flow and the
 * deployment detail page's map all agree. The folder record is the primary
 * write when one exists (recordings and labels read it); the chime event is
 * then synced best-effort, same as a rename — a chime-only deployment writes
 * the event directly instead.
 */
export async function setDeploymentLocation(
  deployment: { folder: AcDeploymentItem | null; event: DeploymentEventItem | null },
  location: { lat: number; lon: number },
  options?: RenameOptions,
): Promise<{ folder: AcDeploymentItem | null; event: DeploymentEventItem | null }> {
  const { folder, event } = deployment;
  let updatedFolder: AcDeploymentItem | null = null;
  let updatedEvent: DeploymentEventItem | null = null;

  if (folder) {
    const { cid } = await updateAcDeployment(folder, { location }, options);
    updatedFolder = applyAcDeploymentEdit(folder, { location }, cid);
    if (event && folder.eventRef === event.uri) {
      try {
        const edit = eventLocationEdit(event, location);
        const { cid: eventCid } = await updateDeploymentEvent(event, edit, options);
        updatedEvent = applyDeploymentEdit(event, edit, eventCid);
      } catch (syncError) {
        console.warn("[deployments] chime location sync failed", syncError);
      }
    }
  } else if (event) {
    const edit = eventLocationEdit(event, location);
    const { cid } = await updateDeploymentEvent(event, edit, options);
    updatedEvent = applyDeploymentEdit(event, edit, cid);
  }

  return { folder: updatedFolder, event: updatedEvent };
}

/** Write target: the signed-in account by default, an organization's repo when given. */
type RenameOptions = { repo?: string | null };

/**
 * Rename the chime event alongside its folder record, so the Deployments tab
 * shows the new name too. Returns the updated event for local state, or null
 * when the folder has no chime. Callers treat this as best-effort — the
 * folder rename already succeeded, and the next rename re-syncs the pair.
 */
export async function renameLinkedEvent(
  folder: AcDeploymentItem,
  event: DeploymentEventItem | null,
  name: string,
  options?: RenameOptions,
): Promise<DeploymentEventItem | null> {
  if (!folder.eventRef || !event || event.uri !== folder.eventRef) return null;
  if ((event.locality ?? "") === name) return event;
  const edit = eventRenameEdit(event, name);
  const { cid } = await updateDeploymentEvent(event, edit, options);
  return applyDeploymentEdit(event, edit, cid);
}

/**
 * Rename the folder record standing behind a chime event, so the audio
 * library and the upload pickers show the new name too. No-op when nothing
 * points at the event yet. Best-effort, like {@link renameLinkedEvent}.
 */
export async function renameCompanionFolder(
  event: DeploymentEventItem,
  name: string,
  options?: RenameOptions,
): Promise<void> {
  if (!name.trim()) return;
  const folders = await listAcDeployments(event.did);
  const folder = folders.find((item) => item.eventRef === event.uri);
  if (!folder || folder.name === name.trim()) return;
  await updateAcDeployment(folder, { name }, options);
}
