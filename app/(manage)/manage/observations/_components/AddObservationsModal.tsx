"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  ArrowLeftIcon,
  AudioLinesIcon,
  CameraIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  CopyIcon,
  EllipsisIcon,
  FileSpreadsheetIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  Layers2Icon,
  Loader2Icon,
  MapPinIcon,
  MergeIcon,
  PlusIcon,
  RotateCcwIcon,
  RulerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SplitIcon,
  TagIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalContent, ModalHeader, ModalTitle, ModalDescription } from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { cn } from "@/lib/utils";
import {
  groupManageTarget,
  manageApiHref,
  personalManageTarget,
  type ManageTarget,
} from "@/lib/links";
import {
  switcherGroupIdentifier,
  useAccountList,
  useActiveAccountContext,
} from "@/app/_lib/account-switcher";
import { useViewer } from "@/app/_lib/viewer";
import { canCreateRecord } from "../../_lib/cgs-permissions";
import {
  cleanFileName,
  dateFromFile,
  imageMetadata,
  prepareObservationImage,
} from "./observation-image";
import {
  configureObservationMutationRepo,
  createObservationMeasurements,
  createObservationOccurrence,
  createObservationPhoto,
  formatObservationMutationError,
  rollbackObservationOccurrence,
  setObservationPrimaryImage,
  type ObservationBlobRef,
} from "./observation-mutations";
import { LocationPickerModal, LocationPickerModalId } from "./LocationPickerModal";
import { ObservationCsvUpload } from "./ObservationCsvUpload";
import { fetchDefaultObservationCenter, roundCoord, type PickedLocation } from "./default-location";
import {
  buildObservationLocationFields,
  DEFAULT_FUZZY_AREA,
  FUZZY_AREA_OPTIONS,
  radiusForArea,
  type FuzzyAreaId,
} from "./fuzzy-location";
import {
  useUploadTray,
  type UploadTarget,
  type UploadTrayJob,
} from "@/app/_components/upload-tray/upload-tray-context";
import { readAudioMothInfo } from "@/app/_lib/audiomoth/wav-metadata";
import { FILE_READ_TIMEOUT_MS, withReadTimeout } from "@/app/_lib/audiomoth/stall-timeout";
import {
  collectDroppedFiles,
  dropContainsDirectory,
  droppedFolderName,
} from "@/app/_lib/audiomoth/dropped-files";
import { listAcDeployments, type AcDeploymentItem } from "@/app/_lib/ac-deployment";
import { listDeploymentEvents, type DeploymentEventItem } from "@/app/_lib/deployment-events";
import { createEquipment, listEquipment } from "@/app/_lib/equipment";
import {
  legacyRecordingKey,
  listUploadedRecordingKeys,
  type UploadedRecordingKeys,
} from "@/app/_lib/ac-audio";
import { computeFileCid } from "@/app/_lib/audiomoth/content-cid";
import {
  AUDIO_EVENT_SELECTION_PREFIX,
  deviceChipLabel,
  deviceNeedsDeployment,
  formatRecordingBytes,
  formatSampleRates,
  NEW_AUDIO_FOLDER,
  planAudioUploadGroups,
  quickRecordingTime,
  splitObservationFiles,
  summarizeAudioBatch,
  unregisteredDeviceIds,
  uploadableRecordings,
  type QuickRecording,
} from "./observation-audio";

// Keep one quick-add session light; the rich bulk panel handles big imports.
const MAX_PHOTOS = 100;
// Client-side throttles so a 100-photo drop stays responsive: only a few
// photos decode/compress at a time (doing them all at once froze the page),
// identify requests go out in small waves instead of a 100-request burst, and
// a handful of observations upload in parallel on submit.
const PREPARE_CONCURRENCY = 3;
const ANALYZE_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 3;
// Stored as dwc.occurrence.fieldNotes on every observation in this upload.
const BATCH_STORY_MAX = 10_000;
const ANALYZE_ATTEMPTS = 2;
// Safety net so a stalled connection can't leave a card spinning on
// "Identifying…" forever. Sits above the analyze route's own worst-case runtime
// so it only ever trips on a genuine hang, never on a slow-but-working call.
const ANALYZE_TIMEOUT_MS = 75_000;
const UNIDENTIFIED = "unidentified organism";
// WAV headers are read a few files at a time so a whole-card drop (a thousand
// recordings) stays responsive while its summary fills in.
const AUDIO_SCAN_BATCH = 8;

type ItemStatus = "identifying" | "ready" | "uploading" | "uploaded" | "error";

// Drag payload type used to merge one photo card into another observation.
const OBS_ITEM_DND = "application/x-obs-item";

// One observer-entered measurement row ("Height / 4.2 / m"). Kept as free text
// so people can record anything; complete rows (type + value) are stored as a
// generic measurement record linked to the observation.
type QuickMeasurement = { id: string; type: string; value: string; unit: string };

function emptyMeasurement(): QuickMeasurement {
  return { id: crypto.randomUUID(), type: "", value: "", unit: "" };
}

// A project the observations can optionally be attached to (from the account's
// own projects). `locationUri` doubles as the siteRef for photos/occurrences.
type QuickProject = { atUri: string; title: string; locationUri: string | null };

type QuickItem = {
  id: string;
  // Photos sharing a groupId upload as one observation (one occurrence + many
  // photos). Each photo starts in its own group; dragging one onto another
  // merges them.
  groupId: string;
  file: File;
  /** Small JPEG stand-in used for the preview and AI identification, so big
   *  batches never decode or upload full-resolution photos before submit.
   *  Falls back to `file` when the browser can't produce a thumbnail. */
  analysisFile: File;
  previewUrl: string;
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  location: PickedLocation | null;
  notes: string;
  tags: string[];
  measurements: QuickMeasurement[];
  caption: string;
  status: ItemStatus;
  error: string | null;
};

type AnalyzeResponse = {
  analysis?: {
    scientificName?: string;
    vernacularName?: string;
    kingdom?: string;
    eventDate?: string;
    decimalLatitude?: string;
    decimalLongitude?: string;
    occurrenceRemarks?: string;
  };
  error?: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Minimal promise-concurrency gate: at most `limit` tasks run at once, the
// rest wait their turn in FIFO order.
function createLimiter(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

const prepareLimiter = createLimiter(PREPARE_CONCURRENCY);
const analyzeLimiter = createLimiter(ANALYZE_CONCURRENCY);

function keepTextEntryKeysLocal(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  event.stopPropagation();
}

// Local "yyyy-MM-dd" for today — caps the date picker so observers can't select a
// future sighting date (which the occurrence proxy rejects anyway).
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isNamed(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized.length > 0 && normalized !== UNIDENTIFIED;
}

// The analyze route falls back to an "unidentified organism" placeholder when the
// model isn't confident. Treat that as blank so the species field stays empty and
// the observation is clearly flagged as still needing an ID.
function cleanSpecies(name: string | undefined): string {
  const value = (name ?? "").trim();
  return isNamed(value) ? value : "";
}

// The occurrence-level fields shared by every photo in one observation. The
// caption stays per-photo; everything here is unified across the group.
type QuickGroupFields = {
  scientificName: string;
  vernacularName: string;
  kingdom: string;
  eventDate: string;
  notes: string;
  location: PickedLocation | null;
  tags: string[];
  measurements: QuickMeasurement[];
};

function mergedGroupFields(items: QuickItem[]): QuickGroupFields {
  const firstText = (key: "scientificName" | "vernacularName" | "kingdom" | "eventDate" | "notes"): string => {
    for (const item of items) {
      const value = item[key].trim();
      if (value) return value;
    }
    return "";
  };
  // Tags merge as a case-insensitive union so combining photos never drops one
  // side's keywords; measurements come from whichever photo has them.
  const tags: string[] = [];
  const seenTags = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (seenTags.has(key)) continue;
      seenTags.add(key);
      tags.push(tag);
    }
  }
  return {
    scientificName: firstText("scientificName"),
    vernacularName: firstText("vernacularName"),
    kingdom: firstText("kingdom") || "Plantae",
    eventDate: firstText("eventDate"),
    notes: firstText("notes"),
    location: items.find((item) => item.location)?.location ?? null,
    tags,
    measurements: items.find((item) => item.measurements.length > 0)?.measurements ?? [],
  };
}

type QuickGroup = { id: string; items: QuickItem[]; fields: QuickGroupFields };

function quickGroups(items: QuickItem[]): QuickGroup[] {
  const order: string[] = [];
  const byId = new Map<string, QuickItem[]>();
  for (const item of items) {
    if (!byId.has(item.groupId)) {
      order.push(item.groupId);
      byId.set(item.groupId, []);
    }
    byId.get(item.groupId)!.push(item);
  }
  return order.map((id) => {
    const groupItems = byId.get(id)!;
    return { id, items: groupItems, fields: mergedGroupFields(groupItems) };
  });
}

function canSubmitGroup(group: QuickGroup): boolean {
  return group.fields.eventDate.trim().length > 0 && group.items.some((item) => item.status !== "uploaded");
}

function quickGroupStatus(items: QuickItem[]): ItemStatus {
  if (items.some((item) => item.status === "uploading")) return "uploading";
  if (items.some((item) => item.status === "identifying")) return "identifying";
  if (items.some((item) => item.status === "error")) return "error";
  if (items.length > 0 && items.every((item) => item.status === "uploaded")) return "uploaded";
  return "ready";
}

export function AddObservationsModal({
  target: initialTarget,
  projectRef,
  projectSiteRef = null,
  sessionDid: sessionDidProp = null,
  onViewObservations,
  onClose,
  onBack,
}: {
  target: ManageTarget;
  /** When set, each new observation is attached to this project (at-uri). */
  projectRef?: string | null;
  /** The pinned project's mapped site, so sightings added from a project page
   *  carry the same site link as ones filed through the project picker. */
  projectSiteRef?: string | null;
  /** Signed-in user's DID. Optional — callers that already know it can pass it
   *  to skip the session lookup; otherwise it is resolved from the viewer
   *  store, so every entry point gets the same fully-featured flow. */
  sessionDid?: string | null;
  /** Navigate to the observations list (called after a successful add). Receives
   *  the account the batch actually landed in — which may differ from the
   *  target the modal opened with if the uploader switched "Uploading for" —
   *  so the caller can route to that account's observations. */
  onViewObservations: (uploadedTarget: ManageTarget) => void;
  onClose: () => void;
  /** When set, a back arrow returns to whatever opened this flow (e.g. the feed
   *  composer) instead of closing outright. */
  onBack?: () => void;
}) {
  const t = useTranslations("upload.observations.quickAdd");
  const format = useFormatter();
  const router = useRouter();
  const modal = useModal();
  // Every entry point into this flow is the same modal: photos and whole
  // recorder cards, filed under whichever account the uploader picks. Callers
  // may pass the session DID they already have; otherwise it comes from the
  // shared viewer store so no parent has to thread it down.
  const viewer = useViewer();
  const sessionDid = sessionDidProp ?? viewer.sessionDid;
  // Audio branch (design 1d): the same drop zone accepts a whole AudioMoth SD
  // card; recordings are handed to the app-wide background upload tray, which
  // is always mounted in the root layout.
  const uploadTray = useUploadTray();
  // Switches the modal between the photo quick-add flow and the CSV importer
  // reachable from the "More ways" menu.
  const [mode, setMode] = useState<"photos" | "csv">("photos");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStoryId = useId();
  // Separate input with `capture` so phones can jump straight into the camera
  // (surfaced by a touch-only "Take a photo" button).
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const itemsRef = useRef<QuickItem[]>([]);
  // Caches the one device-location request per modal session so adding several
  // photos never re-prompts. Resolves to null when sharing is denied/unavailable.
  const deviceLocationRef = useRef<Promise<PickedLocation | null> | null>(null);

  const [items, setItems] = useState<QuickItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  // Photo-preparation progress (decode + compress). Running counters live in a
  // ref so overlapping addFiles calls share one total; null when idle.
  const [prepareProgress, setPrepareProgress] = useState<{ done: number; total: number } | null>(null);
  const prepareCountsRef = useRef({ done: 0, total: 0 });
  const isPreparing = prepareProgress !== null;
  // Photos whose pending identification was cancelled (skipped or removed).
  // Queued identify calls for these are dropped and late results ignored.
  const analysisCancelledRef = useRef(new Set<string>());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchStory, setBatchStory] = useState("");
  // Result of the last submit run — drives the outcome screen. `failed` counts
  // the cards from that run that errored and are still in the list.
  const [outcome, setOutcome] = useState<{ added: number; failed: number } | null>(null);
  // Tracks how many observations have finished uploading during a submit run, so
  // the footer can show a progress bar instead of just a spinning button.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [defaultCenter, setDefaultCenter] = useState<PickedLocation | null>(null);
  // Privacy: when on, each observation is published as an approximate circle
  // centred on a randomised point rather than the exact pin.
  const [obscureLocation, setObscureLocation] = useState(false);
  const [fuzzyArea, setFuzzyArea] = useState<FuzzyAreaId>(DEFAULT_FUZZY_AREA);
  // Optional project attachment for the whole batch. Only offered when the
  // modal wasn't already opened inside a project context and the account
  // actually has projects — zero extra chrome otherwise.
  const [projects, setProjects] = useState<QuickProject[]>([]);
  const [selectedProjectUri, setSelectedProjectUri] = useState<string>("");

  // ── Audio branch state ── recordings waiting in the modal, the card folder
  // name they came from, and the account context (folders, chime deployments,
  // equipment registry) loaded lazily the first time audio lands.
  const [recordings, setRecordings] = useState<QuickRecording[]>([]);
  const [audioScan, setAudioScan] = useState<{ done: number; total: number } | null>(null);
  const [cardName, setCardName] = useState("");
  /** Folder picker value: "" = automatic, NEW_AUDIO_FOLDER, or a folder AT-URI. */
  const [audioFolderSelection, setAudioFolderSelection] = useState("");
  /** How many recordings the last submit handed to the background tray. */
  const [audioHandedOff, setAudioHandedOff] = useState(0);
  const [audioFolders, setAudioFolders] = useState<AcDeploymentItem[] | null>(null);
  const [chimeEvents, setChimeEvents] = useState<DeploymentEventItem[] | null>(null);
  const [equipment, setEquipment] = useState<{ assetId: string; name: string }[] | null>(null);
  /** Already-uploaded check over the batch — same shape as the Upload tab's. */
  const [audioDedup, setAudioDedup] = useState<{ state: "checking" | "done"; skipped: number } | null>(null);
  const recordingsRef = useRef<QuickRecording[]>([]);
  const folderPickInputRef = useRef<HTMLInputElement | null>(null);
  /** Bumped when the audio batch is removed, so a mid-flight scan stops writing. */
  const audioScanTokenRef = useRef(0);
  const audioScanCountsRef = useRef({ done: 0, total: 0 });
  /** Bumped per dedup run so an outdated check stops writing state. */
  const audioDedupTokenRef = useRef(0);
  /** Uploaded-recording identity keys per destination repo, one fetch each. */
  const dedupKeysRef = useRef(new Map<string, Promise<UploadedRecordingKeys>>());
  /** Which account's audio context (folders/chimes/equipment) is loaded. */
  const audioContextDidRef = useRef<string | null>(null);
  /** The current "Uploading for" DID, for callbacks that outlive a render. */
  const targetDidRef = useRef(initialTarget.did);

  // "Uploading for": the account these observations land in. Seeded from the
  // caller's target (usually the active-account context) and switchable inline
  // when the user belongs to organizations.
  const [activeTarget, setActiveTarget] = useState<ManageTarget>(initialTarget);
  const target = activeTarget;
  // Re-seed if the caller hands us a different account (a fresh open() reuses
  // this mounted instance rather than remounting).
  const seededTargetDid = useRef(initialTarget.did);
  useEffect(() => {
    if (seededTargetDid.current !== initialTarget.did) {
      seededTargetDid.current = initialTarget.did;
      setActiveTarget(initialTarget);
      setSelectedProjectUri("");
    }
  }, [initialTarget]);

  const { personal, groups: accountGroups } = useAccountList(sessionDid);
  const [, setActiveContext] = useActiveAccountContext(sessionDid ?? "");
  // The picker only earns its place for a multi-org user — a single-account
  // user (and any project-pinned open, where the project fixes the account)
  // sees no extra chrome.
  const showAccountPicker = Boolean(sessionDid) && !projectRef && accountGroups.length > 0;

  // Switch which account the batch is filed under, and remember it for the
  // session so subsequent uploads default to the same place.
  const chooseUploadTarget = useCallback(
    (did: string) => {
      if (did === target.did) return;
      if (sessionDid && did === sessionDid) {
        const next = personalManageTarget({
          did: sessionDid,
          accountKind: "user",
          identifier: personal?.handle ?? sessionDid,
          displayName: personal?.displayName ?? null,
          avatarUrl: personal?.avatarUrl ?? null,
        });
        setActiveTarget(next);
        setActiveContext({ type: "personal", did: sessionDid });
      } else {
        const group = accountGroups.find((candidate) => candidate.groupDid === did);
        if (!group) return;
        const identifier = switcherGroupIdentifier(group);
        const next = groupManageTarget({
          did: group.groupDid,
          accountKind: "organization",
          identifier,
          role: group.role,
          displayName: group.displayName,
          avatarUrl: group.avatarUrl,
          currentUserDid: sessionDid,
        });
        setActiveTarget(next);
        setActiveContext({ type: "group", did: group.groupDid, identifier, role: group.role });
      }
      // The old account's projects don't belong to the new one.
      setSelectedProjectUri("");
    },
    [accountGroups, personal, sessionDid, setActiveContext, target.did],
  );

  const personalLabel =
    personal?.displayName?.trim() || personal?.handle?.trim() || t("uploadingForPersonal");
  // Flat option list for the footer picker: the personal account first, then
  // every organization the member belongs to.
  const uploadTargets: { did: string; name: string; avatarUrl: string | null }[] = [
    ...(sessionDid
      ? [{ did: sessionDid, name: personalLabel, avatarUrl: personal?.avatarUrl ?? null }]
      : []),
    ...accountGroups.map((group) => ({
      did: group.groupDid,
      name: group.displayName?.trim() || group.handle?.trim() || group.groupDid,
      avatarUrl: group.avatarUrl ?? null,
    })),
  ];

  const createPermission = canCreateRecord(target);
  const disabledReason = createPermission.allowed ? null : createPermission.reason;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  useEffect(() => {
    targetDidRef.current = target.did;
  }, [target.did]);

  const hasAudio = recordings.length > 0 || audioScan !== null;

  /**
   * The Upload tab's already-uploaded check, ported: hash each readable file
   * (content CID with a legacy name+size fallback) and compare against what
   * the destination account already holds, marking matches skipped before
   * anything is uploaded. Re-run whenever "Uploading for" changes — a card
   * already in one account may be new to another. Failures degrade to a
   * normal upload, exactly like the tab.
   */
  const runAudioDedup = useCallback(async (did: string) => {
    const token = ++audioDedupTokenRef.current;
    const readable = recordingsRef.current.filter((rec) => rec.info);
    if (readable.length === 0) {
      setAudioDedup(null);
      return;
    }
    setAudioDedup({ state: "checking", skipped: 0 });
    let keys: UploadedRecordingKeys;
    try {
      const cached = dedupKeysRef.current.get(did) ?? listUploadedRecordingKeys(did);
      dedupKeysRef.current.set(did, cached);
      keys = await cached;
    } catch {
      // The account couldn't be checked — proceed as a normal upload.
      dedupKeysRef.current.delete(did);
      if (audioDedupTokenRef.current === token) setAudioDedup(null);
      return;
    }
    if (audioDedupTokenRef.current !== token) return;

    let skipped = 0;
    const BATCH = 4;
    for (let i = 0; i < readable.length; i += BATCH) {
      const batch = readable.slice(i, i + BATCH);
      const updates = await Promise.all(
        batch.map(async (rec) => {
          // A card that stops responding must not freeze the check; hashes
          // computed for an earlier account are reused as-is.
          const cid =
            rec.cid !== undefined
              ? rec.cid
              : await withReadTimeout(computeFileCid(rec.file), FILE_READ_TIMEOUT_MS, null);
          const already =
            (cid !== null && keys.cids.has(cid)) ||
            keys.legacy.has(legacyRecordingKey(rec.file.name, rec.file.size));
          if (already) skipped += 1;
          return { id: rec.id, cid, skipped: already };
        }),
      );
      if (audioDedupTokenRef.current !== token) return;
      setRecordings((current) =>
        current.map((rec) => {
          const update = updates.find((candidate) => candidate.id === rec.id);
          return update ? { ...rec, cid: update.cid, skipped: update.skipped } : rec;
        }),
      );
      setAudioDedup({ state: "checking", skipped });
    }
    setAudioDedup({ state: "done", skipped });
  }, []);

  // Load the audio context (existing folders, chime deployments, equipment
  // registry) from the "Uploading for" account the first time recordings
  // land, and again whenever that account changes — the whole audio batch
  // (records, blobs, deployments, registry) lands in that account's repo.
  // All three loads are best-effort: a failure just means no match, and the
  // batch still uploads into a new folder named after the card.
  useEffect(() => {
    if (!hasAudio || audioContextDidRef.current === target.did) return;
    const contextDid = target.did;
    audioContextDidRef.current = contextDid;
    setAudioFolders(null);
    setChimeEvents(null);
    setEquipment(null);
    // Folder URIs from another account are meaningless here.
    setAudioFolderSelection("");
    const keep = <T,>(apply: (value: T) => void) => (value: T) => {
      if (audioContextDidRef.current === contextDid) apply(value);
    };
    void listAcDeployments(contextDid)
      .then(keep(setAudioFolders))
      .catch(keep(() => setAudioFolders([])));
    void listDeploymentEvents(contextDid)
      .then(keep(setChimeEvents))
      .catch(keep(() => setChimeEvents([])));
    void listEquipment(contextDid)
      .then(keep((listed) => setEquipment(listed.map((item) => ({ assetId: item.assetId, name: item.name })))))
      .catch(keep(() => setEquipment([])));
    // What counts as "already uploaded" is per-account too.
    void runAudioDedup(contextDid);
  }, [hasAudio, runAudioDedup, target.did]);

  // ── Audio derived state ── the card summary chip, the per-chime upload
  // groups and the devices that are not in the equipment registry yet.
  const audioSummary = useMemo(() => summarizeAudioBatch(recordings), [recordings]);
  const equipmentAssetIds = useMemo(
    () => (equipment ? equipment.map((item) => item.assetId) : null),
    [equipment],
  );
  const newDeviceIds = useMemo(
    () => unregisteredDeviceIds(audioSummary.deviceIds, equipmentAssetIds),
    [audioSummary.deviceIds, equipmentAssetIds],
  );
  // The device chip: the registered equipment name when the unit is known,
  // otherwise a short ID tail — it only exists once audio lands.
  const deviceChips = useMemo(
    () =>
      audioSummary.deviceIds.map((id) => {
        const registered = equipment?.find(
          (item) => item.assetId.trim().toUpperCase() === id.toUpperCase(),
        );
        return {
          id,
          label: registered?.name ?? deviceChipLabel(id),
          isNew: !registered && equipment !== null,
        };
      }),
    [audioSummary.deviceIds, equipment],
  );
  const audioFallbackFolderName = t("audio.defaultFolderName", {
    date: format.dateTime(audioSummary.earliest ?? new Date(), { dateStyle: "medium" }),
  });
  // The batch split into upload groups, exactly like the Upload tab: chime
  // matches always file under their deployment; the picker governs the rest.
  const audioPlanned = useMemo(
    () =>
      planAudioUploadGroups({
        recordings,
        events: chimeEvents,
        selection: audioFolderSelection,
        folders: audioFolders ?? [],
        cardName,
        fallbackName: audioFallbackFolderName,
      }),
    [audioFallbackFolderName, audioFolderSelection, audioFolders, cardName, chimeEvents, recordings],
  );
  // Where the picker-governed pool goes when left on "automatic".
  const audioAutoPlanned = useMemo(
    () =>
      planAudioUploadGroups({
        recordings,
        events: chimeEvents,
        selection: "",
        folders: audioFolders ?? [],
        cardName,
        fallbackName: audioFallbackFolderName,
      }),
    [audioFallbackFolderName, audioFolders, cardName, chimeEvents, recordings],
  );
  /** Recordings that will actually upload (readable, not already uploaded). */
  const audioUploadableCount = useMemo(() => uploadableRecordings(recordings).length, [recordings]);

  /** Parse WAV headers a few at a time, appending each batch as it is read. */
  const addRecordings = useCallback(async (wavs: File[]) => {
    const token = audioScanTokenRef.current;
    const known = new Set(recordingsRef.current.map((rec) => rec.id));
    const fresh: { id: string; file: File }[] = [];
    // Chronological like the Upload tab — AudioMoth names are timestamps.
    for (const file of [...wavs].sort((a, b) => a.name.localeCompare(b.name))) {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      if (known.has(id)) continue;
      known.add(id);
      fresh.push({ id, file });
    }
    if (fresh.length === 0) return;
    setOutcome(null);
    setAudioHandedOff(0);
    const counts = audioScanCountsRef.current;
    counts.total += fresh.length;
    setAudioScan({ done: counts.done, total: counts.total });
    for (let i = 0; i < fresh.length; i += AUDIO_SCAN_BATCH) {
      const batch = fresh.slice(i, i + AUDIO_SCAN_BATCH);
      // One unreadable file (a sleeping card, a bad sector) must not stall the
      // scan — it is skipped and surfaced in the unreadable count instead.
      const infos = await Promise.all(
        batch.map(({ file }) => withReadTimeout(readAudioMothInfo(file), FILE_READ_TIMEOUT_MS, null)),
      );
      if (audioScanTokenRef.current !== token) return; // batch removed mid-scan
      setRecordings((current) => [
        ...current,
        ...batch.map(({ id, file }, index) => ({ id, file, info: infos[index] ?? null })),
      ]);
      counts.done += batch.length;
      if (counts.done >= counts.total) {
        counts.done = 0;
        counts.total = 0;
        setAudioScan(null);
      } else {
        setAudioScan({ done: counts.done, total: counts.total });
      }
    }
    // The whole card is read — check it against what the destination account
    // already holds (the last overlapping drop to finish kicks it off).
    if (audioScanTokenRef.current === token && audioScanCountsRef.current.total === 0) {
      void runAudioDedup(targetDidRef.current);
    }
  }, [runAudioDedup]);

  /** Drop the waiting audio batch (nothing has uploaded yet). */
  const removeAudioBatch = useCallback(() => {
    audioScanTokenRef.current += 1;
    audioDedupTokenRef.current += 1;
    audioScanCountsRef.current = { done: 0, total: 0 };
    setRecordings([]);
    setAudioScan(null);
    setAudioDedup(null);
    setCardName("");
    setAudioFolderSelection("");
  }, []);

  /**
   * Hand the audio batch to the background upload tray: resolve the folder
   * choice into an upload target, silently register unknown devices in the
   * "Uploading for" account's equipment registry, and enqueue one job per
   * readable recording — records, blobs and any created deployment all land
   * in that account's repo. The tray keeps transferring after the modal
   * closes. Returns the batch handle for later attachment.
   */
  const handOffAudioBatch = useCallback((): { count: number; batchKey: string | null } => {
    if (!sessionDid) return { count: 0, batchKey: null };
    // Records land in the org's repo when uploading for one — same rule as
    // the photo observations above.
    const repoDid = target.kind === "group" ? target.did : null;
    // Group per chime like the Upload tab: matched chimes go to their own
    // deployments, the picker-governed pool to its folder or event.
    const planned = planAudioUploadGroups({
      recordings: recordingsRef.current,
      events: chimeEvents,
      selection: audioFolderSelection,
      folders: audioFolders ?? [],
      cardName,
      fallbackName: audioFallbackFolderName,
    });
    if (planned.groups.length === 0) return { count: 0, batchKey: null };
    const summary = summarizeAudioBatch(recordingsRef.current);
    // "We'll add it when this upload starts": unknown devices join the
    // account's equipment registry silently, best-effort — a failed write
    // never blocks the recordings themselves.
    for (const id of unregisteredDeviceIds(summary.deviceIds, equipmentAssetIds)) {
      void createEquipment(
        {
          assetId: id,
          name: `AudioMoth ${id.slice(-4)}`,
          category: "audiomoth",
          status: "storage",
          acquiredAt: new Date().toISOString().slice(0, 10),
          notes: t("audio.equipmentNote"),
        },
        repoDid ? { repo: repoDid } : undefined,
      ).catch(() => {});
    }
    const batchKey = crypto.randomUUID();
    const jobs: UploadTrayJob[] = [];
    for (const group of planned.groups) {
      const uploadTarget: UploadTarget =
        group.plan.kind === "event"
          ? { kind: "event", event: group.plan.event }
          : group.plan.kind === "existing"
            ? { kind: "existing", uri: group.plan.uri }
            : { kind: "named", name: group.plan.name, deployedAt: group.plan.deployedAt };
      for (const rec of group.recordings) {
        jobs.push({
          id: `${batchKey}:${rec.id}`,
          file: rec.file,
          info: rec.info!,
          recordedAt: quickRecordingTime(rec).toISOString(),
          // Hash from the dedup check rides along so the tray never re-reads.
          cid: rec.cid,
          deploymentId: rec.info!.deploymentId ?? undefined,
          repoDid,
          batchKey,
          target: uploadTarget,
          makePreviews: true,
        });
      }
    }
    uploadTray.enqueue(sessionDid, jobs);
    audioScanTokenRef.current += 1;
    audioDedupTokenRef.current += 1;
    audioScanCountsRef.current = { done: 0, total: 0 };
    setRecordings([]);
    setAudioScan(null);
    setAudioDedup(null);
    setCardName("");
    setAudioFolderSelection("");
    setAudioHandedOff(jobs.length);
    return { count: jobs.length, batchKey };
  }, [
    audioFallbackFolderName,
    audioFolderSelection,
    audioFolders,
    cardName,
    chimeEvents,
    equipmentAssetIds,
    sessionDid,
    t,
    target,
    uploadTray,
  ]);

  /**
   * "Set one up ↗" (design 1d, fourth panel): start the upload right away —
   * bandwidth is the bottleneck, not the form — then leave for the
   * deployments tab carrying the batch handle. The batch attaches to the
   * deployment the moment it is created there; until then it sits in a
   * folder named after the card, so nothing is ever stranded.
   */
  const setUpDeploymentAndGo = useCallback(() => {
    const { count, batchKey } = handOffAudioBatch();
    onClose();
    const params = new URLSearchParams({ tab: "deployments" });
    if (batchKey && count > 0) {
      params.set("attachBatch", batchKey);
      params.set("attachCount", String(count));
    }
    router.push(`/observations/audio?${params.toString()}`);
  }, [handOffAudioBatch, onClose, router]);

  // Point the shared occurrence mutations at the right repo (the org for a
  // group context, the signed-in user otherwise) for the lifetime of the modal.
  useEffect(() => {
    configureObservationMutationRepo(target.kind === "group" ? target.did : null);
    return () => configureObservationMutationRepo(null);
  }, [target]);

  // Best-effort starting point for the map picker.
  useEffect(() => {
    const controller = new AbortController();
    void fetchDefaultObservationCenter(target.did, controller.signal)
      .then((center) => {
        if (center) setDefaultCenter(center);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [target.did]);

  // Load the account's projects for the optional "Add to a project" picker.
  // Skipped entirely when the caller already pinned a project via projectRef.
  useEffect(() => {
    if (projectRef) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(manageApiHref("/api/manage/projects", target), { cache: "no-store" });
        const data = (await response.json()) as Array<Record<string, unknown>> | { error?: string };
        if (cancelled || !response.ok || !Array.isArray(data)) return;
        const mapped = data
          .map((raw) => {
            const atUri = typeof raw.atUri === "string" ? raw.atUri : null;
            if (!atUri) return null;
            return {
              atUri,
              title: typeof raw.title === "string" && raw.title.trim() ? raw.title : atUri,
              locationUri: typeof raw.locationUri === "string" ? raw.locationUri : null,
            } satisfies QuickProject;
          })
          .filter((project): project is QuickProject => Boolean(project));
        setProjects(mapped);
      } catch {
        // Project attachment is optional; ignore load failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectRef, target]);

  // Revoke object URLs on unmount so previews don't leak.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  // Ask the device for its current location so photos without their own GPS can
  // be auto-located. We prompt at most once per modal session and, crucially,
  // never guess: if the observer denies access or the browser can't resolve a
  // fix, this resolves to null and the location is simply left blank.
  const requestDeviceLocation = useCallback((): Promise<PickedLocation | null> => {
    if (deviceLocationRef.current) return deviceLocationRef.current;
    const promise = new Promise<PickedLocation | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      if (typeof window !== "undefined" && !window.isSecureContext) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({ lat: roundCoord(position.coords.latitude), lng: roundCoord(position.coords.longitude) }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 },
      );
    });
    deviceLocationRef.current = promise;
    return promise;
  }, []);

  // One analyze call with a couple of retries on transient (429/5xx/network)
  // failures. Returns the model's suggestion, or null when identification
  // couldn't be completed at all.
  const fetchAnalysis = useCallback(async (file: File): Promise<NonNullable<AnalyzeResponse["analysis"]> | null> => {
    for (let attempt = 0; attempt < ANALYZE_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
      try {
        const formData = new FormData();
        formData.set("image", file);
        const response = await fetch("/api/manage/observations/analyze", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
        if (!response.ok || data.error) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < ANALYZE_ATTEMPTS - 1) {
            await sleep(700 * (attempt + 1));
            continue;
          }
          return null;
        }
        return data.analysis ?? {};
      } catch {
        // Includes the abort fired when one attempt outruns ANALYZE_TIMEOUT_MS.
        if (attempt < ANALYZE_ATTEMPTS - 1) {
          await sleep(700 * (attempt + 1));
          continue;
        }
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }, []);

  // First-pass identification for a freshly added photo. Fills only the fields
  // the observer hasn't set, so it never clobbers manual edits.
  const analyzeItem = useCallback(
    async (id: string, file: File) => {
      const cancelled = analysisCancelledRef.current;
      // Identify in small waves — a big drop must not fire one request per
      // photo at once. Cancelled items skip the network call entirely.
      const a = await analyzeLimiter(async () => (cancelled.has(id) ? null : fetchAnalysis(file)));
      if (cancelled.has(id)) return;
      if (!a) {
        // Identification is best-effort: leave the fields for the user.
        setItems((current) =>
          current.map((item) => (item.id === id && item.status === "identifying" ? { ...item, status: "ready" } : item)),
        );
        return;
      }
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            status: "ready",
            scientificName: isNamed(item.scientificName) ? item.scientificName : cleanSpecies(a.scientificName),
            vernacularName: item.vernacularName || a.vernacularName?.trim() || "",
            kingdom: a.kingdom?.trim() || item.kingdom,
            eventDate: item.eventDate || a.eventDate?.trim() || "",
            // Location comes from photo GPS metadata first, then the user's
            // device/location choice. AI analysis must not replace it.
            location: item.location,
            notes: item.notes || a.occurrenceRemarks?.trim() || "",
          };
        }),
      );
    },
    [fetchAnalysis],
  );

  // Re-run identification for one observation on demand and replace the species
  // suggestion across every photo in it, while keeping the observer's date,
  // location, notes and captions intact.
  const reanalyzeGroup = useCallback(
    async (groupId: string) => {
      const groupItems = itemsRef.current.filter((item) => item.groupId === groupId);
      const sample = groupItems[0];
      if (!sample || groupItems.some((item) => item.status === "uploading" || item.status === "uploaded")) return;
      const ids = new Set(groupItems.map((item) => item.id));
      for (const id of ids) analysisCancelledRef.current.delete(id);
      setItems((current) =>
        current.map((item) => (ids.has(item.id) ? { ...item, status: "identifying", error: null } : item)),
      );
      const a = await analyzeLimiter(() => fetchAnalysis(sample.analysisFile));
      setItems((current) =>
        current.map((item) => {
          if (!ids.has(item.id)) return item;
          if (!a) return { ...item, status: "ready" };
          return {
            ...item,
            status: "ready",
            scientificName: cleanSpecies(a.scientificName),
            vernacularName: a.vernacularName?.trim() || "",
            kingdom: a.kingdom?.trim() || item.kingdom,
            notes: item.notes || a.occurrenceRemarks?.trim() || "",
          };
        }),
      );
    },
    [fetchAnalysis],
  );

  // Stop waiting for AI suggestions mid-batch: photos still identifying flip
  // straight to "ready" (fields left for the observer) and their queued
  // identify calls are dropped, so a slow or stuck AI never blocks the upload.
  const skipIdentification = useCallback(() => {
    for (const item of itemsRef.current) {
      if (item.status === "identifying") analysisCancelledRef.current.add(item.id);
    }
    setItems((current) =>
      current.map((item) => (item.status === "identifying" ? { ...item, status: "ready" } : item)),
    );
  }, []);

  const addFiles = useCallback(
    async (fileList: FileList | File[] | null, folderName = "") => {
      if (disabledReason) {
        setError(disabledReason);
        return;
      }
      setOutcome(null);
      // One zone, the files decide: images join the photo cards, WAVs join the
      // audio batch. A photo-only upload never sees the audio branch at all.
      const { images: imageFiles, wavs } = splitObservationFiles(Array.from(fileList ?? []));
      if (wavs.length > 0) {
        if (folderName) setCardName((current) => (current.trim() ? current : folderName));
        void addRecordings(wavs);
      }
      if (imageFiles.length === 0) return;

      const counts = prepareCountsRef.current;
      const remaining = Math.max(0, MAX_PHOTOS - itemsRef.current.length - (counts.total - counts.done));
      const files = imageFiles.slice(0, remaining);
      if (files.length < imageFiles.length) setError(t("tooMany", { max: MAX_PHOTOS }));
      else setError(null);
      if (files.length === 0) return;

      counts.total += files.length;
      setPrepareProgress({ done: counts.done, total: counts.total });
      // A small pool prepares photos a few at a time and each card appears the
      // moment its photo is ready — a 100-photo drop stays responsive and gives
      // immediate feedback instead of freezing until the whole batch is done.
      await Promise.all(
        files.map((source) =>
          prepareLimiter(async () => {
            try {
              const id = `${source.name}-${source.size}-${source.lastModified}-${crypto.randomUUID()}`;
              const meta = await imageMetadata(source);
              const lat = Number.parseFloat(meta.decimalLatitude ?? "");
              const lng = Number.parseFloat(meta.decimalLongitude ?? "");
              // On failure fall back to the original; the upload may still succeed.
              const prepared = await prepareObservationImage(source).catch(() => ({
                file: source,
                thumbnail: null,
              }));
              const item: QuickItem = {
                id,
                groupId: id,
                file: prepared.file,
                analysisFile: prepared.thumbnail ?? prepared.file,
                previewUrl: URL.createObjectURL(prepared.thumbnail ?? prepared.file),
                scientificName: "",
                vernacularName: "",
                kingdom: "Plantae",
                eventDate: meta.eventDate || dateFromFile(source),
                // Only seed from the photo's own GPS here. Photos without EXIF
                // coordinates are auto-located from the device below (with the
                // observer's permission) rather than dropped on a default pin.
                location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
                notes: "",
                tags: [],
                measurements: [],
                caption: cleanFileName(source.name),
                status: "identifying",
                error: null,
              };
              setItems((current) => [...current, item]);
              void analyzeItem(item.id, item.analysisFile);

              // Auto-fill the location for photos without GPS of their own.
              // This asks for location access once per session; if the observer
              // allows it we drop the current-location pin, and if they deny it
              // the field stays blank for them to set manually.
              if (!item.location) {
                void requestDeviceLocation().then((coords) => {
                  if (!coords) return;
                  setItems((current) =>
                    current.map((candidate) =>
                      candidate.id === item.id && !candidate.location ? { ...candidate, location: coords } : candidate,
                    ),
                  );
                });
              }
            } finally {
              counts.done += 1;
              if (counts.done >= counts.total) {
                counts.done = 0;
                counts.total = 0;
                setPrepareProgress(null);
              } else {
                setPrepareProgress({ done: counts.done, total: counts.total });
              }
            }
          }),
        ),
      );
    },
    [addRecordings, analyzeItem, disabledReason, requestDeviceLocation, t],
  );

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.currentTarget.value = "";
  }

  // "Choose a card folder": a webkitdirectory input hands over every file in
  // the folder; the card's name comes from the first relative path segment.
  function onFolderInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const relative = (files[0] as { webkitRelativePath?: string } | undefined)?.webkitRelativePath ?? "";
    const folderName = relative.includes("/") ? relative.split("/")[0]! : "";
    void addFiles(files, folderName);
    event.currentTarget.value = "";
  }

  function dragHasFiles(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (!dragHasFiles(event)) return;
    const droppedItems = event.dataTransfer.items;
    // A whole SD card dragged from the file manager arrives as a directory
    // entry — walk it (entries must be grabbed before the drop event settles).
    if (droppedItems && dropContainsDirectory(droppedItems)) {
      const folderName = droppedFolderName(droppedItems);
      void collectDroppedFiles(droppedItems).then((files) => addFiles(files, folderName));
      return;
    }
    void addFiles(event.dataTransfer.files);
  }

  // Remove a whole observation (all its photos) from the queue.
  function removeGroup(groupId: string) {
    // Don't waste queued identify calls on photos that are gone.
    for (const item of itemsRef.current) {
      if (item.groupId === groupId) analysisCancelledRef.current.add(item.id);
    }
    setItems((current) => {
      for (const item of current) {
        if (item.groupId === groupId) URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((item) => item.groupId !== groupId);
    });
    setError(null);
  }

  // Apply a shared occurrence-level change to every photo in one observation.
  function patchGroup(groupId: string, patch: Partial<QuickGroupFields>) {
    setItems((current) => current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)));
  }

  // Copy one observation's date + location onto every other observation in the
  // batch — a one-tap way out of repeating the same entry across many cards.
  function applyDateLocationToAll(sourceGroupId: string) {
    setItems((current) => {
      const source = current.find((item) => item.groupId === sourceGroupId);
      if (!source) return current;
      return current.map((item) =>
        item.groupId === sourceGroupId || item.status === "uploading" || item.status === "uploaded"
          ? item
          : { ...item, eventDate: source.eventDate, location: source.location },
      );
    });
  }

  // Fold every photo of one observation into another and unify the shared
  // fields. This powers the tap-friendly "combine with above" button — the
  // touch counterpart of dragging one photo onto another card.
  function mergeGroupIntoGroup(sourceGroupId: string, targetGroupId: string) {
    if (sourceGroupId === targetGroupId) return;
    setItems((current) => {
      const source = current.filter((item) => item.groupId === sourceGroupId);
      const target = current.filter((item) => item.groupId === targetGroupId);
      if (source.length === 0 || target.length === 0) return current;
      const fields = mergedGroupFields([...target, ...source]);
      return current.map((item) =>
        item.groupId === targetGroupId || item.groupId === sourceGroupId
          ? { ...item, groupId: targetGroupId, ...fields }
          : item,
      );
    });
    setError(null);
  }

  // Drag a photo onto another observation: move it into that group and unify the
  // group's shared fields (keeping any non-empty value from either side).
  function mergeItemIntoGroup(itemId: string, targetGroupId: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === itemId);
      if (!item || item.groupId === targetGroupId) return current;
      const combined = [...current.filter((candidate) => candidate.groupId === targetGroupId), item];
      if (combined.length < 2) return current;
      const fields = mergedGroupFields(combined);
      return current.map((candidate) =>
        candidate.groupId === targetGroupId || candidate.id === itemId
          ? { ...candidate, groupId: targetGroupId, ...fields }
          : candidate,
      );
    });
    setError(null);
  }

  // Pull one photo back out of a multi-photo observation into its own.
  function separateItem(itemId: string) {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === itemId);
      if (!item || current.filter((candidate) => candidate.groupId === item.groupId).length <= 1) return current;
      return current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, groupId: `${candidate.id}-${crypto.randomUUID()}` } : candidate,
      );
    });
    setError(null);
  }

  function openLocationPicker(group: QuickGroup) {
    modal.pushModal(
      {
        id: LocationPickerModalId,
        dialogWidth: "max-w-2xl",
        content: (
          <LocationPickerModal
            initial={group.fields.location}
            defaultCenter={defaultCenter}
            onSelect={(location) => patchGroup(group.id, { location })}
          />
        ),
      },
      false,
    );
    void modal.show();
  }

  const groups = quickGroups(items);
  const submittableCount = groups.filter(canSubmitGroup).length;
  // Drives the AI-detection progress bar so the identify phase never feels frozen.
  const identifyingCount = items.filter((item) => item.status === "identifying").length;

  // Upload one observation: a single occurrence carrying every photo in the
  // group, with the first photo set as the primary image the explorer reads.
  async function uploadGroup(
    group: QuickGroup,
    batchContext?: { eventID: string; fieldNotes: string },
  ): Promise<boolean> {
    const { fields } = group;
    // Resolve the location into Darwin Core fields, swapping the precise pin for
    // a randomised circle when the observer opted to keep their location private.
    const locationFields = fields.location
      ? buildObservationLocationFields(fields.location, {
          obscure: obscureLocation,
          radiusMeters: radiusForArea(fuzzyArea),
        })
      : { decimalLatitude: "", decimalLongitude: "" };
    // Project attachment: the caller-pinned project wins; otherwise the one the
    // observer picked in the modal (with its site carried along when it has one).
    const selectedProject = projects.find((project) => project.atUri === selectedProjectUri) ?? null;
    const effectiveProjectUri = projectRef ?? selectedProject?.atUri ?? null;
    const effectiveSiteUri = projectRef ? projectSiteRef : (selectedProject?.locationUri ?? null);
    const tags = fields.tags.map((tag) => tag.trim()).filter(Boolean);
    const occurrence = await createObservationOccurrence({
      basisOfRecord: "HumanObservation",
      scientificName: fields.scientificName.trim(),
      vernacularName: fields.vernacularName.trim(),
      kingdom: fields.kingdom.trim() || "Plantae",
      eventDate: fields.eventDate.trim(),
      occurrenceRemarks: fields.notes.trim(),
      associatedMedia: group.items.map((item) => item.file.name).join(", "),
      ...locationFields,
      ...(batchContext?.eventID ? { eventID: batchContext.eventID } : {}),
      ...(batchContext?.fieldNotes ? { fieldNotes: batchContext.fieldNotes } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(effectiveProjectUri ? { projectRef: effectiveProjectUri } : {}),
      ...(effectiveSiteUri ? { siteRef: effectiveSiteUri } : {}),
    });
    try {
      // Store the observer's optional measurements as one linked record. Only
      // complete rows (both what was measured and a value) are kept.
      const measurementEntries = fields.measurements
        .map((entry) => ({
          measurementType: entry.type.trim(),
          measurementValue: entry.value.trim(),
          ...(entry.unit.trim() ? { measurementUnit: entry.unit.trim() } : {}),
        }))
        .filter((entry) => entry.measurementType && entry.measurementValue);
      if (measurementEntries.length > 0) {
        await createObservationMeasurements({ occurrenceRef: occurrence.uri, entries: measurementEntries });
      }
      let primaryBlobRef: ObservationBlobRef | null = null;
      for (const item of group.items) {
        const photo = await createObservationPhoto({
          imageFile: item.file,
          occurrenceRef: occurrence.uri,
          subjectPart: "wholeOrganism",
          caption: item.caption.trim() || undefined,
          siteRef: effectiveSiteUri ?? undefined,
        });
        if (!primaryBlobRef && photo.blobRef) primaryBlobRef = photo.blobRef;
      }
      if (!primaryBlobRef) throw new Error(t("photoUploadFailed"));
      await setObservationPrimaryImage({
        rkey: occurrence.rkey,
        record: occurrence.record ?? {},
        swapCid: occurrence.cid,
        blobRef: primaryBlobRef,
      });
      return true;
    } catch (error) {
      await rollbackObservationOccurrence(occurrence.rkey).catch((cleanupError) => {
        console.error("Could not roll back incomplete observation", cleanupError);
      });
      throw error;
    }
  }

  async function submit() {
    if (disabledReason) {
      setError(disabledReason);
      return;
    }
    const queue = quickGroups(itemsRef.current).filter(canSubmitGroup);
    // Recordings go first: they are handed to the background tray in one
    // synchronous step, so the bytes start moving before (and independently
    // of) the photo observations below.
    const handedOff = handOffAudioBatch().count;
    if (queue.length === 0) {
      if (handedOff > 0) {
        setError(null);
        setOutcome({ added: 0, failed: 0 });
      } else {
        setError(t("nothingToSubmit"));
      }
      return;
    }
    const trimmedBatchStory = batchStory.trim().slice(0, BATCH_STORY_MAX);
    const batchContext = trimmedBatchStory
      ? { eventID: `gainforest-upload-${crypto.randomUUID()}`, fieldNotes: trimmedBatchStory }
      : undefined;
    setIsSubmitting(true);
    setError(null);
    setUploadProgress({ done: 0, total: queue.length });
    let success = 0;
    // A few observations upload in parallel — each one is already a sequence
    // of requests (occurrence + photos), so a small pool cuts total time for
    // big batches without hammering the mutation proxy.
    const uploadLimiter = createLimiter(UPLOAD_CONCURRENCY);
    await Promise.all(
      queue.map((group) =>
        uploadLimiter(async () => {
          const ids = new Set(group.items.map((item) => item.id));
          setItems((current) =>
            current.map((item) => (ids.has(item.id) ? { ...item, status: "uploading", error: null } : item)),
          );
          try {
            await uploadGroup(group, batchContext);
            success += 1;
            setUploadProgress((progress) => (progress ? { ...progress, done: progress.done + 1 } : progress));
            setItems((current) => {
              for (const item of current) {
                if (ids.has(item.id)) URL.revokeObjectURL(item.previewUrl);
              }
              return current.filter((item) => !ids.has(item.id));
            });
          } catch (uploadError) {
            const message = formatObservationMutationError(uploadError, {
              photoTooLarge: t("photoTooLarge"),
              photoUploadFailed: t("photoUploadFailed"),
            });
            setItems((current) =>
              current.map((item) => (ids.has(item.id) ? { ...item, status: "error", error: message } : item)),
            );
          }
        }),
      ),
    );
    setIsSubmitting(false);
    setUploadProgress(null);
    if (success > 0) {
      const failed = queue.length - success;
      if (failed === 0) setBatchStory("");
      setOutcome({ added: success, failed });
      setError(null);
    } else {
      // Nothing made it — stay on the card list, where every card already
      // shows its own error and the submit button doubles as retry.
      setError(t("uploadFailed"));
    }
  }

  // CSV importer — reached from the "More ways" menu. The mutation repo is
  // already pointed at the right account by the effect above, so the importer
  // can write occurrences and measurements straight away.
  if (mode === "csv") {
    return (
      <ObservationCsvUpload
        target={target}
        projectRef={projectRef}
        onBack={() => setMode("photos")}
        onClose={onClose}
      />
    );
  }

  // Audio-only outcome — the whole submit was a hand-off to the background
  // tray: nothing failed, nothing was created here; the recordings keep
  // uploading while the uploader browses.
  if (outcome !== null && outcome.added === 0 && outcome.failed === 0) {
    return (
      <ModalContent className="space-y-5" dismissible={false}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <AudioLinesIcon className="size-7" />
          </span>
          <div>
            <ModalTitle>{t("audio.handedOffTitle", { count: audioHandedOff })}</ModalTitle>
            <ModalDescription className="mt-1">{t("audio.handedOffBody")}</ModalDescription>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={() => setOutcome(null)}>
            {t("audio.handedOffAddMore")}
          </Button>
          <Button
            onClick={() => {
              uploadTray?.setExpanded(true);
              onClose();
            }}
          >
            {t("audio.handedOffView")}
          </Button>
        </div>
      </ModalContent>
    );
  }

  // Outcome screen — the batch finished; nothing navigates on its own. Say
  // what happened (all in, or how many failed) and let the uploader decide:
  // stay to add or fix more, or go to the account's observations.
  if (outcome !== null) {
    const allIn = outcome.failed === 0;
    const accountName = target.displayName?.trim() || target.identifier;
    return (
      <ModalContent className="space-y-5" dismissible={false}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span
            className={cn(
              "grid size-14 place-items-center rounded-2xl ring-1",
              allIn
                ? "bg-primary/10 text-primary ring-primary/15"
                : "bg-amber-500/10 text-amber-600 ring-amber-500/20",
            )}
          >
            {allIn ? <CheckCircle2Icon className="size-7" /> : <AlertTriangleIcon className="size-7" />}
          </span>
          <div>
            <ModalTitle>
              {allIn
                ? t("doneTitle", { count: outcome.added })
                : t("partialTitle", { added: outcome.added, total: outcome.added + outcome.failed })}
            </ModalTitle>
            <ModalDescription className="mt-1">
              {allIn
                ? t("doneAccount", { name: accountName })
                : t("partialBody", { failed: outcome.failed })}
            </ModalDescription>
            {audioHandedOff > 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("audio.backgroundNote", { count: audioHandedOff })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {allIn ? (
            <>
              <Button variant="outline" onClick={() => setOutcome(null)}>
                <ImagePlusIcon className="size-4" />
                {t("addMore")}
              </Button>
              <Button onClick={() => { setOutcome(null); onViewObservations(target); }}>
                {t("viewObservations")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOutcome(null)}>{t("reviewPhotos")}</Button>
              <Button variant="outline" onClick={() => { setOutcome(null); onViewObservations(target); }}>
                {t("viewObservations")}
              </Button>
              <Button onClick={() => { setOutcome(null); void submit(); }}>
                <RotateCcwIcon className="size-4" />
                {t("tryAgain")}
              </Button>
            </>
          )}
        </div>
      </ModalContent>
    );
  }

  const showEmptyState = items.length === 0 && !hasAudio;

  // "1,204 WAV · 6.2 GB · 48 kHz · 12–26 Jun" — the card summary chip.
  const audioSummaryLine = [
    t("audio.summary", {
      count: audioSummary.count,
      size: formatRecordingBytes(audioSummary.totalBytes),
    }),
    formatSampleRates(audioSummary.sampleRatesHz),
    audioSummary.earliest && audioSummary.latest
      ? format.dateTimeRange(audioSummary.earliest, audioSummary.latest, { day: "numeric", month: "short" })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // The folder picker's "automatic" row says where the picker-governed pool
  // will actually go (chime-matched groups are filed on their own).
  const audioAutoPlan = audioAutoPlanned.unmatchedPlan;
  const audioAutoLabel =
    audioAutoPlan === null
      ? ""
      : audioAutoPlan.kind === "event"
        ? t("audio.folderAutoMatched", { name: audioAutoPlan.event.locality ?? audioAutoPlan.event.eventID })
        : audioAutoPlan.kind === "existing"
          ? audioAutoPlan.name
          : t("audio.folderNew", { name: audioAutoPlan.name });

  return (
    // flex (not space-y) so child margins can't collapse into the dialog's
    // wrapper: the "Uploading for" footer relies on -mb-6 to bleed over the
    // dialog's p-6, and a collapsed margin would leave a strip of padding
    // below it instead of sitting flush on the bottom edge.
    <ModalContent className="flex flex-col gap-4" dismissible={false}>
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                onClick={onBack}
                aria-label={t("back")}
                className="-ml-1 -mt-1 shrink-0 rounded-full"
                disabled={isSubmitting}
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
            ) : null}
            <ModalTitle>{t("title")}</ModalTitle>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="-mt-1 rounded-full"
                  disabled={isSubmitting}
                  aria-label={t("moreWays")}
                  title={t("moreWays")}
                >
                  <EllipsisIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMode("csv")}>
                  <FileSpreadsheetIcon className="size-4" />
                  {t("uploadCsv")}
                </DropdownMenuItem>
                {/* Very large archives (photos + survey exports) go through the
                    batch-review pipeline instead of this modal. */}
                <DropdownMenuItem asChild onClick={onClose}>
                  <Link href="/submit-data">
                    <ArchiveIcon className="size-4" />
                    {t("submitDataBatch")}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("close")}
              className="-mr-1 -mt-1 rounded-full"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        </div>
        <ModalDescription className="mt-1">{t("description")}</ModalDescription>
      </ModalHeader>

      {items.length > 0 ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <label htmlFor={batchStoryId} className="text-sm font-medium text-foreground">
            {t("batchStoryLabel")}
          </label>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("batchStoryHint")}</p>
          <Textarea
            id={batchStoryId}
            value={batchStory}
            maxLength={BATCH_STORY_MAX}
            rows={3}
            placeholder={t("batchStoryPlaceholder")}
            onChange={(event) => setBatchStory(event.currentTarget.value.slice(0, BATCH_STORY_MAX))}
            onKeyDown={keepTextEntryKeysLocal}
            disabled={isSubmitting}
            className="mt-2 resize-y"
          />
        </div>
      ) : null}

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border border-dashed transition-colors",
          isDragging ? "border-primary bg-primary/10" : "border-primary/30",
          // Below the modal system's 32rem drawer breakpoint the dialog runs
          // fullscreen (fullscreenOnMobile), so let the empty drop zone grow
          // into the freed-up height instead of leaving a dead lower half.
          showEmptyState
            ? "px-6 py-10 max-[32rem]:grid max-[32rem]:min-h-[55dvh] max-[32rem]:place-items-center"
            : "p-3",
        )}
      >
        {showEmptyState ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              {isPreparing ? <Loader2Icon className="size-7 animate-spin" /> : <UploadCloudIcon className="size-7" />}
            </span>
            <div>
              <p className="font-instrument text-xl font-medium italic tracking-[-0.02em] text-foreground">
                {/* Touch devices can't drag & drop files, so swap the invitation. */}
                <span className="[@media(pointer:coarse)]:hidden">{t("dropTitle")}</span>
                <span className="hidden [@media(pointer:coarse)]:inline">{t("dropTitleTouch")}</span>
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("dropHint", { max: MAX_PHOTOS })}
              </p>
            </div>
            <div className="flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Field-friendly shortcut straight into the camera; touch-only. */}
              <Button
                type="button"
                className="hidden rounded-full [@media(pointer:coarse)]:inline-flex"
                onClick={() => cameraInputRef.current?.click()}
                disabled={Boolean(disabledReason) || isPreparing}
                title={disabledReason ?? undefined}
              >
                <CameraIcon className="size-4" />
                {t("takePhoto")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(disabledReason) || isPreparing}
                title={disabledReason ?? undefined}
              >
                {t("choose")}
              </Button>
              {/* A whole card at once — folder picking needs a real file
                  manager, so the button stays off coarse-pointer devices. */}
              <Button
                type="button"
                variant="outline"
                className="rounded-full [@media(pointer:coarse)]:hidden"
                onClick={() => folderPickInputRef.current?.click()}
                disabled={Boolean(disabledReason) || isPreparing}
                title={disabledReason ?? undefined}
              >
                <FolderOpenIcon className="size-4" />
                {t("chooseFolder")}
              </Button>
            </div>
          </div>
        ) : (
          // Phones scroll the dialog as one surface (nested scrollers trap the
          // touch gesture); larger screens keep the list in its own scroll area
          // so the footer stays put.
          <div className="space-y-3 sm:max-h-[52vh] sm:overflow-y-auto sm:pr-1">
            {prepareProgress ? (
              <QuickProgress
                label={t("preparingProgress", { done: prepareProgress.done, total: prepareProgress.total })}
                done={prepareProgress.done}
                total={prepareProgress.total}
              />
            ) : null}
            {identifyingCount > 0 ? (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <QuickProgress
                    label={t("identifyingProgress", { done: items.length - identifyingCount, total: items.length })}
                    done={items.length - identifyingCount}
                    total={items.length}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={skipIdentification}
                  disabled={isSubmitting}
                  className="h-6 shrink-0 rounded-full px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                >
                  {t("skipIdentify")}
                </Button>
              </div>
            ) : null}
            {items.length > 1 ? (
              // Drag & drop needs a mouse — only pitch it on fine-pointer devices.
              // Touch users get the "combine with above" buttons between cards.
              <p className="hidden items-center gap-1.5 px-0.5 text-xs text-muted-foreground [@media(pointer:fine)]:flex">
                <Layers2Icon className="size-3.5 shrink-0 text-primary" />
                {t("combineTip")}
              </p>
            ) : null}
            {groups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => mergeGroupIntoGroup(group.id, groups[index - 1].id)}
                      disabled={isSubmitting}
                      className="h-6 rounded-full border-dashed px-2.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      <MergeIcon className="size-3" />
                      {t("combineWithAbove")}
                    </Button>
                  </div>
                ) : null}
                <ObservationGroupCard
                  group={group}
                  groupCount={groups.length}
                  disabled={isSubmitting}
                  onChange={(patch) => patchGroup(group.id, patch)}
                  onRemoveGroup={() => removeGroup(group.id)}
                  onSeparateItem={separateItem}
                  onDropItem={(itemId) => mergeItemIntoGroup(itemId, group.id)}
                  onPickLocation={() => openLocationPicker(group)}
                  onReanalyze={() => reanalyzeGroup(group.id)}
                  onApplyToAll={() => applyDateLocationToAll(group.id)}
                  t={t}
                />
              </Fragment>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-w-0 flex-1 rounded-xl border-dashed"
                onClick={() => fileInputRef.current?.click()}
                disabled={Boolean(disabledReason) || isPreparing || isSubmitting || items.length >= MAX_PHOTOS}
              >
                {isPreparing ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
                {t("addMore")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden rounded-xl border-dashed [@media(pointer:coarse)]:inline-flex"
                onClick={() => cameraInputRef.current?.click()}
                disabled={Boolean(disabledReason) || isPreparing || isSubmitting || items.length >= MAX_PHOTOS}
                aria-label={t("takePhoto")}
                title={t("takePhoto")}
              >
                <CameraIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* The device chip and its folder row exist only once audio lands — a
          photo upload never sees the word "device" (design 1d). */}
      {hasAudio ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <AudioLinesIcon className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {cardName.trim() || t("audio.batchTitle")}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{audioSummaryLine}</p>
                {audioSummary.unreadable > 0 ? (
                  <p className="mt-0.5 text-xs leading-5 text-amber-600 dark:text-amber-400">
                    {t("audio.unreadable", { count: audioSummary.unreadable })}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 rounded-full"
              onClick={removeAudioBatch}
              disabled={isSubmitting}
              aria-label={t("audio.remove")}
              title={t("audio.remove")}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          {audioScan ? (
            <QuickProgress
              label={t("audio.readingProgress", { done: audioScan.done, total: audioScan.total })}
              done={audioScan.done}
              total={audioScan.total}
            />
          ) : null}
          {audioDedup && (audioDedup.state === "checking" || audioDedup.skipped > 0) ? (
            <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              {audioDedup.state === "checking" ? (
                <Loader2Icon className="size-3.5 shrink-0 animate-spin text-primary" />
              ) : (
                <CheckCircle2Icon className="size-3.5 shrink-0" />
              )}
              {audioDedup.state === "checking"
                ? t("audio.dedupChecking")
                : t("audio.dedupSkipped", { count: audioDedup.skipped })}
            </p>
          ) : null}
          {deviceChips.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 pt-3">
              <span className="text-sm text-muted-foreground">{t("audio.recordingFromLabel")}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {deviceChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {chip.label}
                    {chip.isNew ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {t("audio.deviceNew")}
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {/* Chime-matched recordings are filed under their own deployments,
              exactly like the Upload tab — the picker cannot override them. */}
          {audioPlanned.matchedCount > 0 ? (
            <p className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs leading-5 text-muted-foreground">
              <CheckCircle2Icon className="size-3.5 shrink-0 text-primary" />
              {t("audio.matchedCount", { count: audioPlanned.matchedCount })}
            </p>
          ) : null}
          {/* The folder/deployment picker governs only the unmatched pool. */}
          {audioPlanned.unmatchedCount > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">{t("audio.folderLabel")}</span>
              <Select
                value={audioFolderSelection || "auto"}
                onValueChange={(value) => setAudioFolderSelection(value === "auto" ? "" : value)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-8 w-full sm:w-64" aria-label={t("audio.folderLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{audioAutoLabel}</SelectItem>
                  {(audioFolders ?? []).map((folder) => (
                    <SelectItem key={folder.uri} value={folder.uri}>
                      {folder.name}
                    </SelectItem>
                  ))}
                  {/* Manual assignment to a deployment event — the Upload
                      tab's "assign to deployment" select, folded in here. */}
                  {(chimeEvents ?? []).map((chimeEvent) => (
                    <SelectItem
                      key={chimeEvent.uri}
                      value={`${AUDIO_EVENT_SELECTION_PREFIX}${chimeEvent.uri}`}
                    >
                      {t("audio.eventOption", { name: chimeEvent.locality ?? chimeEvent.eventID })}
                    </SelectItem>
                  ))}
                  {audioAutoPlan?.kind !== "named" ? (
                    <SelectItem value={NEW_AUDIO_FOLDER}>
                      {t("audio.folderNew", { name: cardName.trim() || audioFallbackFolderName })}
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {newDeviceIds.length > 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("audio.newDeviceNote", {
                device: newDeviceIds.map((id) => deviceChipLabel(id)).join(", "),
              })}
            </p>
          ) : null}
          {deviceNeedsDeployment(audioSummary, audioFolders, audioPlanned.matchedCount > 0) ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("audio.noDeployments")}{" "}
              <button
                type="button"
                onClick={setUpDeploymentAndGo}
                disabled={
                  isSubmitting ||
                  audioScan !== null ||
                  audioDedup?.state === "checking" ||
                  audioUploadableCount === 0
                }
                className="font-medium text-primary underline underline-offset-2 disabled:opacity-50"
              >
                {t("audio.setUpDeployment")}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* A batch already handed to the background tray keeps a visible pill
          here — nothing uploads silently, nothing is stranded. */}
      {audioHandedOff > 0 && !hasAudio ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-border bg-muted/30 px-3 py-2.5">
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <AudioLinesIcon className="size-4 shrink-0 text-primary" />
            {t("audio.backgroundNote", { count: audioHandedOff })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => uploadTray?.setExpanded(true)}
          >
            {t("audio.viewTray")}
          </Button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.wav,audio/wav,audio/x-wav"
        multiple
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onInputChange}
      />
      <input
        ref={folderPickInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFolderInputChange}
        {...({ webkitdirectory: "" } as Record<string, string>)}
      />

      {items.length > 0 && !projectRef && projects.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <FolderOpenIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t("projectLabel")}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("projectHint")}</p>
            </div>
          </div>
          <Select
            value={selectedProjectUri || "none"}
            onValueChange={(value) => setSelectedProjectUri(value === "none" ? "" : value)}
            disabled={isSubmitting}
          >
            <SelectTrigger className="h-8 w-full sm:w-56" aria-label={t("projectLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("projectNone")}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.atUri} value={project.atUri}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={obscureLocation}
              onCheckedChange={(checked) => setObscureLocation(checked === true)}
              disabled={isSubmitting}
              className="mt-0.5"
              aria-label={t("obscureLabel")}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldCheckIcon className="size-4 shrink-0 text-primary" />
                {t("obscureLabel")}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{t("obscureHint")}</span>
            </span>
          </label>
          {obscureLocation ? (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("obscureAreaLabel")}</span>
              <Select
                value={fuzzyArea}
                onValueChange={(value) => setFuzzyArea(value as FuzzyAreaId)}
                disabled={isSubmitting}
              >
                <SelectTrigger className="h-8 w-full sm:w-56" aria-label={t("obscureAreaLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUZZY_AREA_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {t(`obscureArea_${option.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {!showEmptyState ? (
        // On phones the whole dialog scrolls, so pin the submit bar to the
        // bottom edge (full-bleed over the dialog's p-6) — the primary action
        // stays reachable however long the card list grows. From sm up the list
        // scrolls internally instead and the footer sits statically below it.
        <div
          className={cn(
            "sticky bottom-0 z-10 -mx-6 space-y-3 border-t border-border bg-background px-6 pt-3 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-3",
            // When the "Uploading for" footer sits below, don't bleed to the
            // very bottom — let that bar own the modal's bottom edge.
            showAccountPicker ? "pb-3" : "-mb-6 pb-5 sm:mb-0 sm:pb-0",
          )}
        >
          {isSubmitting && uploadProgress ? (
            <QuickProgress
              label={t("uploadingProgress", { done: uploadProgress.done, total: uploadProgress.total })}
              done={uploadProgress.done}
              total={uploadProgress.total}
            />
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="text-sm text-muted-foreground">
              {[
                items.length > 0 || audioUploadableCount === 0
                  ? t("readyCount", { count: submittableCount })
                  : null,
                audioUploadableCount > 0 ? t("audio.readyCount", { count: audioUploadableCount }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <Button
              onClick={submit}
              disabled={
                (submittableCount === 0 && audioUploadableCount === 0) ||
                audioScan !== null ||
                audioDedup?.state === "checking" ||
                isSubmitting ||
                Boolean(disabledReason)
              }
              className="w-full sm:w-auto"
            >
              {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {isSubmitting
                ? t("submitting")
                : submittableCount === 0 && audioUploadableCount > 0
                  ? t("audio.submitOnly", { count: audioUploadableCount })
                  : submittableCount === 0 && audioSummary.count > 0 && audioDedup?.state === "done"
                    ? t("audio.allUploaded")
                    : t("submit", { count: submittableCount })}
            </Button>
          </div>
        </div>
      ) : null}

      {/* “Uploading for” lives in a persistent footer bar so a multi-org member
          can retarget the batch at any point without hunting for the sidebar
          switcher. Full-bleed over the dialog's p-6, flush to the bottom edge. */}
      {showAccountPicker ? (
        <div className="-mx-6 -mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-4xl border-t border-border bg-primary/10 px-6 pt-3.5 pb-3 max-[32rem]:-mx-4 max-[32rem]:-mb-4 max-[32rem]:rounded-none">
          <span className="text-sm text-muted-foreground">{t("uploadingForLabel")}</span>
          <Select value={target.did} onValueChange={chooseUploadTarget} disabled={isSubmitting}>
            <SelectTrigger
              className="h-9 w-auto min-w-[11rem] gap-2 rounded-xl bg-background font-medium"
              aria-label={t("uploadingForLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uploadTargets.map((option) => (
                <SelectItem key={option.did} value={option.did}>
                  <span className="flex items-center gap-2">
                    <AccountBadge url={option.avatarUrl} name={option.name} />
                    <span className="truncate">{option.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </ModalContent>
  );
}

// Small round account avatar for the “Uploading for” picker — image when the
// account has one, otherwise its first initial on a soft tint.
function AccountBadge({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
      {url ? (
        <Image src={url} alt="" fill unoptimized sizes="20px" className="object-cover" />
      ) : (
        (name.trim()[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}

// Per-observation status pill: a clear at-a-glance signal for whether a card is
// still identifying, ready with a name, or uploaded-but-unidentified and waiting
// for the observer to add an ID.
function QuickStatusBadge({
  status,
  named,
  t,
}: {
  status: ItemStatus;
  named: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "identifying") {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Loader2Icon className="size-3.5 animate-spin" />
        {t("identifying")}
      </span>
    );
  }
  if (status === "uploading") {
    return (
      <span className={cn(base, "bg-muted text-muted-foreground")}>
        <Loader2Icon className="size-3.5 animate-spin" />
        {t("submitting")}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(base, "bg-destructive/10 text-destructive")}>
        <CircleHelpIcon className="size-3.5" />
        {t("statusError")}
      </span>
    );
  }
  if (named) {
    return (
      <span className={cn(base, "bg-primary/10 text-primary")}>
        <CheckCircle2Icon className="size-3.5" />
        {t("statusReady")}
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
      <CircleHelpIcon className="size-3.5" />
      {t("statusNeedsId")}
    </span>
  );
}

// Determinate progress bar reused for both the AI-detection and upload phases, so
// the observer can always see things are moving rather than wondering if the page
// has frozen. The caller passes the already-localized label.
function QuickProgress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GroupThumb({
  item,
  canSeparate,
  disabled,
  onSeparate,
  t,
}: {
  item: QuickItem;
  canSeparate: boolean;
  disabled: boolean;
  onSeparate: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const uploading = item.status === "uploading";
  return (
    <div className="group/thumb relative size-20 shrink-0">
      <div
        draggable={!disabled && !uploading}
        onDragStart={(event) => {
          event.dataTransfer.setData(OBS_ITEM_DND, item.id);
          event.dataTransfer.setData("text/plain", item.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        className={cn(
          "relative size-20 overflow-hidden rounded-xl bg-muted ring-1 ring-border",
          !disabled && !uploading && "cursor-grab active:cursor-grabbing",
        )}
      >
        <Image src={item.previewUrl} alt={item.caption} fill sizes="80px" draggable={false} className="object-cover" unoptimized />
        {uploading ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2Icon className="size-5 animate-spin text-primary" />
          </div>
        ) : null}
      </div>
      {canSeparate && !disabled && !uploading ? (
        <button
          type="button"
          onClick={onSeparate}
          aria-label={t("separatePhoto")}
          title={t("separatePhoto")}
          className="absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:size-6"
        >
          <SplitIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ObservationGroupCard({
  group,
  groupCount,
  disabled,
  onChange,
  onRemoveGroup,
  onSeparateItem,
  onDropItem,
  onPickLocation,
  onReanalyze,
  onApplyToAll,
  t,
}: {
  group: QuickGroup;
  groupCount: number;
  disabled: boolean;
  onChange: (patch: Partial<QuickGroupFields>) => void;
  onRemoveGroup: () => void;
  onSeparateItem: (itemId: string) => void;
  onDropItem: (itemId: string) => void;
  onPickLocation: () => void;
  onReanalyze: () => void;
  onApplyToAll: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [isOver, setIsOver] = useState(false);
  // Optional detail sections stay hidden until asked for, so the default card
  // remains as light as possible; once they carry content they stay visible.
  const [tagsOpen, setTagsOpen] = useState(group.fields.tags.length > 0);
  const [measurementsOpen, setMeasurementsOpen] = useState(group.fields.measurements.length > 0);
  const { fields, items } = group;
  const showTags = tagsOpen || fields.tags.length > 0;
  const showMeasurements = measurementsOpen || fields.measurements.length > 0;
  const status = quickGroupStatus(items);
  const identifying = status === "identifying";
  const uploading = status === "uploading";
  const multi = items.length > 1;
  // A blank species is allowed (submitted as unidentified); show a gentle hint
  // rather than a validation warning.
  const unnamed = !isNamed(fields.scientificName) && !identifying;
  const error = items.find((item) => item.error)?.error ?? null;

  function isItemDrag(event: DragEvent<HTMLDivElement>): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(OBS_ITEM_DND);
  }

  return (
    <div
      onDragOver={(event) => {
        if (!isItemDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(event) => {
        if (!isItemDrag(event)) return;
        setIsOver(false);
      }}
      onDrop={(event) => {
        if (!isItemDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        const itemId = event.dataTransfer.getData(OBS_ITEM_DND) || event.dataTransfer.getData("text/plain");
        if (itemId) onDropItem(itemId);
      }}
      className={cn(
        "relative rounded-2xl border bg-card p-3 transition-colors",
        isOver ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <QuickStatusBadge status={status} named={isNamed(fields.scientificName)} t={t} />
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onReanalyze}
            disabled={disabled || uploading || identifying}
            aria-label={t("reanalyzeAria")}
            title={t("reanalyzeAria")}
            className="h-7 rounded-full px-2 text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon className="size-3.5" />
            <span className="hidden sm:inline">{t("reanalyze")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemoveGroup}
            disabled={disabled || uploading}
            aria-label={t("removeObservation")}
            title={t("removeObservation")}
            className="rounded-full text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <GroupThumb
            key={item.id}
            item={item}
            canSeparate={multi}
            disabled={disabled}
            onSeparate={() => onSeparateItem(item.id)}
            t={t}
          />
        ))}
      </div>

      {multi ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <Layers2Icon className="size-3.5 shrink-0 text-primary" />
          <span>{t("photoCount", { count: items.length })}</span>
          <span className="text-muted-foreground/50">·</span>
          {/* Dragging photos out needs a mouse; on touch only the split button works. */}
          <span className="hidden [@media(pointer:fine)]:inline">{t("dragMergeHint")}</span>
          <span className="[@media(pointer:fine)]:hidden">{t("dragMergeHintTouch")}</span>
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="relative">
          <Input
            value={fields.scientificName}
            onChange={(event) => onChange({ scientificName: event.target.value })}
            onKeyDown={keepTextEntryKeysLocal}
            placeholder={identifying ? t("identifying") : t("speciesPlaceholder")}
            disabled={disabled || uploading}
            aria-label={t("speciesLabel")}
            className="pr-8"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {identifying ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4 opacity-50" />
            )}
          </span>
        </div>
        {fields.vernacularName ? (
          <p className="-mt-1 truncate text-xs text-muted-foreground">{fields.vernacularName}</p>
        ) : unnamed ? (
          <p className="-mt-1 text-xs text-muted-foreground">{t("speciesOptionalHint")}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* A Popover-anchored calendar (not a native <input type="date">): the
              browser's native date dropdown escaped and clipped against the
              modal's overflow. This stays inside the viewport and visually
              matches the location button beside it. Future dates are blocked
              since observations are past sightings (and the server rejects them). */}
          <DatePicker
            value={fields.eventDate}
            onChange={(value) => onChange({ eventDate: value })}
            disabled={disabled || uploading}
            max={todayIso()}
            placeholder={t("dateLabel")}
            className="h-9 gap-2 rounded-full border border-border bg-background px-4 py-0 text-sm font-normal hover:bg-muted"
          />
          <Button
            type="button"
            variant="outline"
            onClick={onPickLocation}
            disabled={disabled || uploading}
            className="justify-start gap-2 font-normal"
          >
            <MapPinIcon className={cn("size-4 shrink-0", fields.location ? "text-primary" : "text-muted-foreground")} />
            <span className="truncate">
              {fields.location ? t("locationSet", { lat: fields.location.lat, lng: fields.location.lng }) : t("setLocation")}
            </span>
          </Button>
        </div>

        {groupCount > 1 && (fields.eventDate.trim() || fields.location) ? (
          <div className="-mt-1 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onApplyToAll}
              disabled={disabled || uploading}
              className="h-6 rounded-full px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
            >
              <CopyIcon className="size-3" />
              {t("applyToAll")}
            </Button>
          </div>
        ) : null}

        <Textarea
          value={fields.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          onKeyDown={keepTextEntryKeysLocal}
          placeholder={t("notesPlaceholder")}
          disabled={disabled || uploading}
          aria-label={t("notesLabel")}
          rows={2}
          className="resize-none"
        />

        {showTags ? (
          <QuickTagsEditor
            tags={fields.tags}
            disabled={disabled || uploading}
            onChange={(tags) => onChange({ tags })}
            onClear={() => {
              onChange({ tags: [] });
              setTagsOpen(false);
            }}
            t={t}
          />
        ) : null}

        {showMeasurements ? (
          <QuickMeasurementsEditor
            measurements={fields.measurements}
            disabled={disabled || uploading}
            onChange={(measurements) => onChange({ measurements })}
            onClear={() => {
              onChange({ measurements: [] });
              setMeasurementsOpen(false);
            }}
            t={t}
          />
        ) : null}

        {!showTags || !showMeasurements ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {!showTags ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setTagsOpen(true)}
                disabled={disabled || uploading}
                className="h-7 rounded-full border-dashed px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <TagIcon className="size-3.5" />
                {t("addTags")}
              </Button>
            ) : null}
            {!showMeasurements ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setMeasurementsOpen(true);
                  if (fields.measurements.length === 0) onChange({ measurements: [emptyMeasurement()] });
                }}
                disabled={disabled || uploading}
                className="h-7 rounded-full border-dashed px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <RulerIcon className="size-3.5" />
                {t("addMeasurements")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

// Chip-style tag editor: type a keyword, press Enter (or comma) to add it.
// Tags are stored on the observation record itself.
function QuickTagsEditor({
  tags,
  disabled,
  onChange,
  onClear,
  t,
}: {
  tags: string[];
  disabled: boolean;
  onChange: (tags: string[]) => void;
  onClear: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.replace(/,/g, " ").trim().slice(0, 64);
    setDraft("");
    if (!value) return;
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return;
    onChange([...tags, value]);
  }

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <TagIcon className="size-3.5 text-primary" />
          {t("tagsLabel")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={disabled}
          aria-label={t("clearTags")}
          title={t("clearTags")}
          className="size-6 rounded-full text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((candidate) => candidate !== tag))}
              disabled={disabled}
              aria-label={t("tagRemove", { tag })}
              className="grid size-4 place-items-center rounded-full transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            keepTextEntryKeysLocal(event);
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={t("tagsPlaceholder")}
          disabled={disabled}
          aria-label={t("tagsLabel")}
          className="h-7 min-w-32 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 md:h-6 md:text-sm"
        />
      </div>
    </div>
  );
}

// The measurement types offered as quick suggestions while typing.
const MEASUREMENT_SUGGESTION_KEYS = ["height", "dbh", "canopy", "count", "weight"] as const;

// Free-form measurement rows (what was measured / value / unit). Complete rows
// are saved as one measurement record linked to the observation.
function QuickMeasurementsEditor({
  measurements,
  disabled,
  onChange,
  onClear,
  t,
}: {
  measurements: QuickMeasurement[];
  disabled: boolean;
  onChange: (measurements: QuickMeasurement[]) => void;
  onClear: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const listId = useId();

  function patchRow(id: string, patch: Partial<QuickMeasurement>) {
    onChange(measurements.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <RulerIcon className="size-3.5 text-primary" />
          {t("measurementsLabel")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          disabled={disabled}
          aria-label={t("clearMeasurements")}
          title={t("clearMeasurements")}
          className="size-6 rounded-full text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <datalist id={listId}>
        {MEASUREMENT_SUGGESTION_KEYS.map((key) => (
          <option key={key} value={t(`measurementSuggestion_${key}`)} />
        ))}
      </datalist>
      <div className="mt-1.5 space-y-1.5">
        {measurements.map((entry) => (
          <div key={entry.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_auto] items-center gap-1.5">
            <Input
              value={entry.type}
              onChange={(event) => patchRow(entry.id, { type: event.target.value })}
              onKeyDown={keepTextEntryKeysLocal}
              placeholder={t("measurementTypePlaceholder")}
              disabled={disabled}
              aria-label={t("measurementTypeLabel")}
              list={listId}
              className="h-9 md:h-8"
            />
            <Input
              value={entry.value}
              onChange={(event) => patchRow(entry.id, { value: event.target.value })}
              onKeyDown={keepTextEntryKeysLocal}
              placeholder={t("measurementValuePlaceholder")}
              disabled={disabled}
              aria-label={t("measurementValueLabel")}
              inputMode="decimal"
              className="h-9 md:h-8"
            />
            <Input
              value={entry.unit}
              onChange={(event) => patchRow(entry.id, { unit: event.target.value })}
              onKeyDown={keepTextEntryKeysLocal}
              placeholder={t("measurementUnitPlaceholder")}
              disabled={disabled}
              aria-label={t("measurementUnitLabel")}
              className="h-9 md:h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(measurements.filter((candidate) => candidate.id !== entry.id))}
              disabled={disabled}
              aria-label={t("removeMeasurementRow")}
              title={t("removeMeasurementRow")}
              className="size-7 rounded-full text-muted-foreground hover:text-destructive"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onChange([...measurements, emptyMeasurement()])}
          disabled={disabled}
          className="h-7 rounded-full px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
          {t("addMeasurementRow")}
        </Button>
      </div>
    </div>
  );
}
