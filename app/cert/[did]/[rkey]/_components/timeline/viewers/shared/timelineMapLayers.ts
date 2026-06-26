import type { TimelineAttachmentItem } from "@/app/_lib/indexer";
import { getAttachmentContextSubject } from "../../attachmentSubjects";
import { parseAtUri } from "../../atUri";
import type { TimelineReference } from "../../timelineReferences";

export type TimelineMapLayer = {
  datasetUri: string;
  title: string;
  description?: string;
  siteRef: {
    uri: string;
    cid: string;
  } | null;
};

type TimelineMapLayerEntry = {
  item: TimelineAttachmentItem;
  references: TimelineReference[];
};

function cleanAtUri(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized?.startsWith("at://") ? normalized : null;
}

function isTreeDatasetAtUri(uri: string): boolean {
  return parseAtUri(uri)?.collection === "app.gainforest.dwc.dataset";
}

export function buildTimelineMapLayers(
  entries: TimelineMapLayerEntry[],
): TimelineMapLayer[] {
  const seenDatasetUris = new Set<string>();
  const layers: TimelineMapLayer[] = [];

  for (const entry of entries) {
    const siteRef = getAttachmentContextSubject(entry.item.record.subjects);

    for (const reference of entry.references) {
      const datasetUri = cleanAtUri(reference.treeGroupUri) ?? cleanAtUri(reference.id);
      if (reference.kind !== "tree" || !datasetUri || !isTreeDatasetAtUri(datasetUri)) {
        continue;
      }

      if (seenDatasetUris.has(datasetUri)) {
        continue;
      }

      seenDatasetUris.add(datasetUri);
      layers.push({
        datasetUri,
        title: reference.title,
        description: reference.description,
        siteRef,
      });
    }
  }

  return layers;
}
