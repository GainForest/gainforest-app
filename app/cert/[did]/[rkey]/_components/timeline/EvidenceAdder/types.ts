import type {
  ManagedAudio,
  ManagedLocation,
  OccurrenceRecord,
  UploadTreeDatasetRecord,
} from "@/app/_lib/indexer";
import type { AttachmentDraft } from "../contextAttachmentMutations";

export const CONTENT_TYPE_TREE_DATASET = "tree-dataset";
export const CONTENT_TYPE_NATURE = "biodiversity";
export const CONTENT_TYPE_NATURE_DATASET = "biodiversity-dataset";

export type TimelineSourceData = {
  audio: ManagedAudio[];
  occurrences: OccurrenceRecord[];
  occurrencesIncomplete: boolean;
  treeGroups: UploadTreeDatasetRecord[];
  places: ManagedLocation[];
};

export type TimelineSourceStatus = "idle" | "loading" | "ready" | "error";

export type TimelineMutationPermission = {
  allowed: boolean;
  reason: string | null;
};

export type EvidenceTab = "audio" | "trees" | "nature" | "files";

export type EvidenceSubmitter = (
  drafts: AttachmentDraft | AttachmentDraft[],
  onSuccess?: () => void,
) => Promise<void> | void;

export function hasTimelineSourceData(sources: TimelineSourceData): boolean {
  return (
    sources.audio.length > 0 ||
    sources.occurrences.length > 0 ||
    sources.treeGroups.length > 0 ||
    sources.places.length > 0 ||
    sources.occurrencesIncomplete
  );
}
