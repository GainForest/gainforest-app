import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { parseAtUri } from "../atUri";
import { parseAttachmentContent } from "../attachmentContentParser";
import { CONTENT_TYPE_NATURE, CONTENT_TYPE_NATURE_DATASET } from "./types";

const TREE_DATASET_COLLECTION = "app.gainforest.dwc.dataset";
const NATURE_OCCURRENCE_COLLECTION = "app.gainforest.dwc.occurrence";

export function getLinkedTreeGroupUris(
  entries: TimelineAttachmentItem[],
): Set<string> {
  const linked = new Set<string>();

  for (const entry of entries) {
    for (const item of parseAttachmentContent(entry.record.content)) {
      if (
        item.kind === "uri" &&
        parseAtUri(item.uri)?.collection === TREE_DATASET_COLLECTION
      ) {
        linked.add(item.uri);
      }
    }
  }

  return linked;
}

export function getLinkedNatureUris(
  entries: TimelineAttachmentItem[],
): Set<string> {
  const linked = new Set<string>();

  for (const entry of entries) {
    const normalizedContentType = entry.record.contentType?.trim().toLowerCase();
    const natureDatasetEntry =
      normalizedContentType === CONTENT_TYPE_NATURE ||
      normalizedContentType === CONTENT_TYPE_NATURE_DATASET;

    for (const item of parseAttachmentContent(entry.record.content)) {
      if (item.kind !== "uri") continue;

      const collection = parseAtUri(item.uri)?.collection;
      if (collection === NATURE_OCCURRENCE_COLLECTION) {
        linked.add(item.uri);
      }

      if (natureDatasetEntry && collection === TREE_DATASET_COLLECTION) {
        linked.add(item.uri);
      }
    }
  }

  return linked;
}
