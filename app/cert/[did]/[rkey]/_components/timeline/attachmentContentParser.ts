import { parseAtUri } from "./atUri";

export type AttachmentUriKind = "at-uri" | "http-url" | "other-uri";

export type ParsedAttachmentContent =
  | {
      kind: "uri";
      sourceType: "uri-definition" | "strong-ref" | "plain-uri";
      uri: string;
      uriKind: AttachmentUriKind;
      cid: string | null;
    }
  | {
      kind: "blob";
      sourceType:
        | "small-blob-definition"
        | "resolved-blob"
        | "raw-blob"
        | "file-definition";
      uri: string | null;
      uriKind: AttachmentUriKind | null;
      name: string | null;
      mimeType: string | null;
      size: number | null;
      cid: string | null;
      ref: string | null;
    }
  | {
      kind: "text";
      sourceType: "plain-text" | "text-definition";
      text: string;
    }
  | { kind: "unknown"; sourceType: "unknown" };

export type RenderableAttachmentLink = {
  href: string;
  sourceType: "uri" | "blob";
  mimeType: string | null;
  size: number | null;
  cid: string | null;
  name: string | null;
};

type JsonRecord = Record<string, unknown>;

const TREE_DATASET_COLLECTION = "app.gainforest.dwc.dataset";

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getStringField(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumberField(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBlobRef(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (isJsonRecord(value)) {
    const link = getStringField(value, "$link");
    if (link) return link;
    const ref = getStringField(value, "ref");
    if (ref) return ref;
  }
  return null;
}

export function getUriKind(uri: string): AttachmentUriKind {
  if (uri.startsWith("at://")) return "at-uri";
  if (
    uri.startsWith("https://") ||
    uri.startsWith("http://") ||
    uri.startsWith("blob:") ||
    uri.startsWith("data:")
  ) {
    return "http-url";
  }
  return "other-uri";
}

function parseUri(uri: string, sourceType: "uri-definition" | "strong-ref" | "plain-uri", cid: string | null = null): ParsedAttachmentContent {
  return {
    kind: "uri",
    sourceType,
    uri,
    uriKind: getUriKind(uri),
    cid,
  };
}

function parseBlobRecord(
  blobRecord: JsonRecord,
  sourceType: Extract<ParsedAttachmentContent, { kind: "blob" }>["sourceType"],
): ParsedAttachmentContent {
  const uri = getStringField(blobRecord, "uri") ?? getStringField(blobRecord, "url");
  const cid = getStringField(blobRecord, "cid") ?? getBlobRef(blobRecord.ref);
  return {
    kind: "blob",
    sourceType,
    uri,
    uriKind: uri ? getUriKind(uri) : null,
    name: getStringField(blobRecord, "name") ?? getStringField(blobRecord, "filename") ?? getStringField(blobRecord, "fileName"),
    mimeType: getStringField(blobRecord, "mimeType") ?? getStringField(blobRecord, "type"),
    size: getNumberField(blobRecord, "size"),
    cid,
    ref: getBlobRef(blobRecord.ref) ?? cid,
  };
}

function isLikelyUri(value: string): boolean {
  return value.startsWith("at://") || /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function parseContentItem(item: unknown): ParsedAttachmentContent {
  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return { kind: "unknown", sourceType: "unknown" };
    return isLikelyUri(trimmed)
      ? parseUri(trimmed, "plain-uri")
      : { kind: "text", sourceType: "plain-text", text: trimmed };
  }

  if (!isJsonRecord(item)) return { kind: "unknown", sourceType: "unknown" };

  const itemType = getStringField(item, "$type") ?? getStringField(item, "type");

  if (itemType === "org.hypercerts.defs#uri") {
    const uri = getStringField(item, "uri");
    if (!uri) return { kind: "unknown", sourceType: "unknown" };
    return parseUri(uri, "uri-definition");
  }

  if (itemType === "com.atproto.repo.strongRef") {
    const uri = getStringField(item, "uri");
    if (!uri) return { kind: "unknown", sourceType: "unknown" };
    return parseUri(uri, "strong-ref", getStringField(item, "cid"));
  }

  if (itemType === "org.hypercerts.defs#smallBlob") {
    const blobValue = item.blob;
    if (!isJsonRecord(blobValue)) return { kind: "unknown", sourceType: "unknown" };
    return parseBlobRecord(blobValue, "small-blob-definition");
  }

  if (itemType === "blob") {
    return parseBlobRecord(item, "resolved-blob");
  }

  const fileValue = item.file;
  if (isJsonRecord(fileValue)) {
    return parseBlobRecord(fileValue, "file-definition");
  }

  const blobValue = item.blob;
  if (isJsonRecord(blobValue)) {
    return parseBlobRecord(blobValue, "raw-blob");
  }

  const uri = getStringField(item, "uri") ?? getStringField(item, "href") ?? getStringField(item, "url");
  if (uri) {
    const sourceType = getStringField(item, "cid") ? "strong-ref" : "uri-definition";
    return parseUri(uri, sourceType, getStringField(item, "cid"));
  }

  const text = getStringField(item, "text") ?? getStringField(item, "plaintext") ?? getStringField(item, "value");
  if (text) {
    return isLikelyUri(text)
      ? parseUri(text, "plain-uri")
      : { kind: "text", sourceType: "text-definition", text };
  }

  if (getStringField(item, "mimeType") || getStringField(item, "cid") || getBlobRef(item.ref)) {
    return parseBlobRecord(item, "raw-blob");
  }

  return { kind: "unknown", sourceType: "unknown" };
}

export function parseAttachmentContent(content: unknown): ParsedAttachmentContent[] {
  if (content === null || content === undefined) return [];
  const inputItems = Array.isArray(content) ? content : [content];
  return inputItems.map((item) => parseContentItem(item));
}

export function getAtUrisFromContent(content: unknown): string[] {
  const seenUris = new Set<string>();
  const uris: string[] = [];

  for (const item of parseAttachmentContent(content)) {
    if (item.kind !== "uri" || item.uriKind !== "at-uri") continue;
    if (seenUris.has(item.uri)) continue;
    seenUris.add(item.uri);
    uris.push(item.uri);
  }

  return uris;
}

export function getRenderableAttachmentLinks(
  parsedItems: ParsedAttachmentContent[],
): RenderableAttachmentLink[] {
  const links: RenderableAttachmentLink[] = [];
  const seen = new Set<string>();

  for (const item of parsedItems) {
    if (item.kind === "uri") {
      if (item.uriKind !== "http-url" || seen.has(item.uri)) continue;
      seen.add(item.uri);
      links.push({
        href: item.uri,
        sourceType: "uri",
        mimeType: null,
        size: null,
        cid: item.cid,
        name: null,
      });
      continue;
    }

    if (item.kind === "blob") {
      if (!item.uri || item.uriKind !== "http-url" || seen.has(item.uri)) continue;
      seen.add(item.uri);
      links.push({
        href: item.uri,
        sourceType: "blob",
        mimeType: item.mimeType,
        size: item.size,
        cid: item.cid,
        name: item.name,
      });
    }
  }

  return links;
}

export function getRenderableAttachmentLinksFromContent(content: unknown): RenderableAttachmentLink[] {
  return getRenderableAttachmentLinks(parseAttachmentContent(content));
}

export function getLinkedTreeDatasetUrisFromContent(content: unknown): string[] {
  const linkedDatasetUris: string[] = [];
  const seenUris = new Set<string>();

  for (const item of parseAttachmentContent(content)) {
    if (
      item.kind !== "uri" ||
      item.uriKind !== "at-uri" ||
      parseAtUri(item.uri)?.collection !== TREE_DATASET_COLLECTION ||
      seenUris.has(item.uri)
    ) {
      continue;
    }

    seenUris.add(item.uri);
    linkedDatasetUris.push(item.uri);
  }

  return linkedDatasetUris;
}
