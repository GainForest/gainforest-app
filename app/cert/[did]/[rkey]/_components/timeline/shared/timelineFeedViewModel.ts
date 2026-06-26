import { parseAtUri } from "../atUri";
import {
  parseAttachmentContent,
  type ParsedAttachmentContent,
} from "../attachmentContentParser";
import type { TimelineReference } from "../timelineReferences";
import { classifyAttachmentPreview } from "./evidenceContentTypeRegistry";
import type { TimelineDocumentFormat } from "./timelineDocumentFormats";

type ParsedAttachmentBlobItem = Extract<ParsedAttachmentContent, { kind: "blob" }>;

export type FeedTileKind =
  | "site"
  | "tree"
  | "nature"
  | "audio"
  | "image"
  | "video"
  | "pdf"
  | "file"
  | "link"
  | "record";

export type TimelinePreviewPayload = {
  kind: "site" | "image" | "video" | "audio" | "pdf" | "document" | "link" | "text";
  href: string;
  title: string;
  body?: string;
  mimeType?: string | null;
  fileName?: string | null;
  extension?: string | null;
  documentFormat?: TimelineDocumentFormat | null;
};

export type TimelineFeedTile = {
  id: string;
  kind: FeedTileKind;
  title: string;
  caption: string;
  preview: TimelinePreviewPayload | null;
};

export type TimelineFeedCopy = {
  linkedNatureDataGroup: string;
  linkedNatureData: string;
  linkedFile: string;
  image: string;
  video: string;
  audio: string;
  pdf: string;
  document: string;
  linkedTreeInformation: string;
  linkedItem: string;
  linkedProjectPlace: string;
  linkedTreeGroup: string;
  linkedSound: string;
  groupedData: string;
  unresolvedReferenceBody: string;
};

function cleanText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getFileNameFromHref(href: string, fallback: string): string {
  try {
    const parsed = new URL(href);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const fileName = parts.at(-1);
    if (fileName && fileName !== "com.atproto.sync.getBlob") {
      return decodeURIComponent(fileName);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function getPathExtensionFromHref(href: string, fileName?: string | null): string | null {
  const candidates = [fileName, href];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const path = candidate.split("?")[0]?.split("#")[0] ?? "";
    const name = path.split("/").filter(Boolean).at(-1);
    const extension = name?.split(".").at(-1)?.toLowerCase();
    if (extension && extension !== name) return extension;
  }

  return null;
}

function titleForPreviewKind(
  kind: TimelinePreviewPayload["kind"],
  fileName: string,
  copy: TimelineFeedCopy,
): string {
  if (kind === "image") return copy.image;
  if (kind === "video") return copy.video;
  if (kind === "audio") return copy.audio;
  if (kind === "pdf") return copy.pdf;
  if (kind === "document") return copy.document;
  return fileName;
}

function getPreviewFromHref(
  href: string,
  mimeType: string | null,
  copy: TimelineFeedCopy,
  fileName?: string | null,
): TimelinePreviewPayload {
  const extension = getPathExtensionFromHref(href, fileName);
  const normalizedFileName = cleanText(fileName) ?? getFileNameFromHref(href, copy.linkedFile);
  const classification = classifyAttachmentPreview(mimeType, extension);
  const kind = classification.kind;

  return {
    kind,
    href,
    title: titleForPreviewKind(kind, normalizedFileName, copy),
    fileName: normalizedFileName,
    mimeType,
    extension,
    documentFormat: classification.documentFormat,
  };
}

function tileKindFromPreview(preview: TimelinePreviewPayload): FeedTileKind {
  if (preview.kind === "site") return "site";
  if (preview.kind === "text") return "record";
  if (preview.kind === "document") return "file";
  if (preview.kind === "link") return "link";
  return preview.kind;
}

function fallbackReferenceTitle(uri: string, copy: TimelineFeedCopy): { title: string; kind: FeedTileKind } {
  const parsed = parseAtUri(uri);
  if (parsed?.collection === "app.certified.location") {
    return { title: copy.linkedProjectPlace, kind: "site" };
  }
  if (parsed?.collection === "app.gainforest.dwc.dataset") {
    return { title: copy.linkedTreeGroup, kind: "tree" };
  }
  if (parsed?.collection === "app.gainforest.dwc.occurrence") {
    return { title: copy.linkedNatureData, kind: "nature" };
  }
  if (parsed?.collection === "app.gainforest.ac.audio") {
    return { title: copy.linkedSound, kind: "audio" };
  }
  return { title: copy.linkedItem, kind: "record" };
}

function previewForReference(
  uri: string,
  reference: TimelineReference | undefined,
  copy: TimelineFeedCopy,
): TimelinePreviewPayload {
  if (reference?.kind === "location" && reference.actionHref) {
    return {
      kind: "site",
      href: reference.actionHref,
      title: reference.title,
      body: reference.description,
    };
  }

  if (reference?.kind === "tree") {
    return {
      kind: "text",
      href: "",
      title: reference.title,
      body: reference.description ?? copy.linkedTreeInformation,
    };
  }

  if (reference?.kind === "biodiversityDataset") {
    return {
      kind: "text",
      href: "",
      title: reference.title,
      body: reference.description ?? copy.linkedNatureDataGroup,
    };
  }

  if (reference?.kind === "occurrence") {
    return {
      kind: "text",
      href: "",
      title: reference.title,
      body: reference.description ?? copy.linkedNatureData,
    };
  }

  if (reference?.kind === "audio" && reference.actionHref) {
    return { kind: "audio", href: reference.actionHref, title: reference.title, body: reference.description };
  }

  if (reference?.actionHref) {
    return { kind: "link", href: reference.actionHref, title: reference.title, body: reference.description };
  }

  if (reference) {
    return {
      kind: "text",
      href: "",
      title: reference.title,
      body: reference.description ?? copy.linkedItem,
    };
  }

  const fallback = fallbackReferenceTitle(uri, copy);
  return {
    kind: "text",
    href: "",
    title: fallback.title,
    body: copy.unresolvedReferenceBody,
  };
}

function tileKindFromReference(reference: TimelineReference | undefined, fallbackKind: FeedTileKind): FeedTileKind {
  if (reference?.kind === "location") return "site";
  if (reference?.kind === "tree") return "tree";
  if (reference?.kind === "occurrence" || reference?.kind === "biodiversityDataset") return "nature";
  if (reference?.kind === "audio") return "audio";
  return fallbackKind;
}

function fromBlob(
  item: ParsedAttachmentBlobItem,
  tileId: string,
  copy: TimelineFeedCopy,
): TimelineFeedTile | null {
  if (!item.uri || item.uriKind !== "http-url") return null;

  const fileName = cleanText(item.name) ?? getFileNameFromHref(item.uri, copy.linkedFile);
  const preview = getPreviewFromHref(item.uri, item.mimeType, copy, fileName);

  return {
    id: tileId,
    kind: tileKindFromPreview(preview),
    title: preview.title,
    caption: preview.fileName ?? fileName,
    preview,
  };
}

export function buildTimelineFeedTiles(args: {
  entryId: string;
  content: unknown;
  references: TimelineReference[];
  copy: TimelineFeedCopy;
}): TimelineFeedTile[] {
  const items = parseAttachmentContent(args.content);
  const refsByUri = new Map(args.references.map((reference) => [reference.id, reference]));

  return items.flatMap((item, index) => {
    const tileId = `${args.entryId}-${index}`;

    if (item.kind === "blob") {
      const tile = fromBlob(item, tileId, args.copy);
      return tile ? [tile] : [];
    }

    if (item.kind === "uri" && item.uriKind === "http-url") {
      const preview = getPreviewFromHref(item.uri, null, args.copy);
      return [
        {
          id: tileId,
          kind: preview.kind === "link" ? "link" : tileKindFromPreview(preview),
          title: preview.title,
          caption: preview.fileName ?? getFileNameFromHref(item.uri, args.copy.linkedFile),
          preview,
        },
      ];
    }

    if (item.kind === "uri" && item.uriKind === "at-uri") {
      const reference = refsByUri.get(item.uri);
      const fallback = fallbackReferenceTitle(item.uri, args.copy);
      const preview = previewForReference(item.uri, reference, args.copy);
      const title = cleanText(reference?.title) ?? fallback.title;
      return [
        {
          id: tileId,
          kind: tileKindFromReference(reference, fallback.kind),
          title,
          caption: cleanText(reference?.description) ?? title,
          preview,
        },
      ];
    }

    return [];
  });
}
