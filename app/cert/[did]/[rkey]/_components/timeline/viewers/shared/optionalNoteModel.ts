export type TimelineOptionalNoteSpan = {
  text: string;
  href?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
};

export type TimelineOptionalNoteBlock =
  | { type: "paragraph"; spans: TimelineOptionalNoteSpan[]; align?: string | null }
  | { type: "heading"; level: number; spans: TimelineOptionalNoteSpan[]; align?: string | null }
  | { type: "blockquote"; spans: TimelineOptionalNoteSpan[]; align?: string | null }
  | { type: "code"; text: string; language?: string | null }
  | { type: "list"; ordered: boolean; items: TimelineOptionalNoteSpan[][] }
  | { type: "image"; src: string; alt?: string | null }
  | { type: "link"; href: string; title?: string | null; description?: string | null }
  | { type: "hr" };

type JsonRecord = Record<string, unknown>;

type NormalizedFacet = {
  index?: { byteStart?: number | null; byteEnd?: number | null } | null;
  features?: Array<JsonRecord | null> | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberField(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeHttpHref(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function safeImageSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ["http:", "https:", "blob:", "data:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function featureType(feature: JsonRecord): string | null {
  return stringField(feature, "$type") ?? stringField(feature, "__typename");
}

function featureHref(feature: JsonRecord): string | null {
  const type = featureType(feature);
  if (type === "app.bsky.richtext.facet#link" || type === "AppBskyRichtextFacetLink") {
    return safeHttpHref(stringField(feature, "uri"));
  }
  if (type === "PubLeafletRichtextFacetLink") {
    return safeHttpHref(stringField(feature, "uri"));
  }
  return null;
}

function applyFeature(span: TimelineOptionalNoteSpan, feature: JsonRecord): void {
  const type = featureType(feature);
  if (type === "PubLeafletRichtextFacetBold") span.bold = true;
  if (type === "PubLeafletRichtextFacetItalic") span.italic = true;
  if (type === "PubLeafletRichtextFacetUnderline") span.underline = true;
  if (type === "PubLeafletRichtextFacetStrikethrough") span.strike = true;
  if (type === "PubLeafletRichtextFacetCode") span.code = true;
  const href = featureHref(feature);
  if (href) span.href = href;
}

function spansFromText(
  text: string,
  facets: NormalizedFacet[] | null | undefined,
): TimelineOptionalNoteSpan[] {
  if (!text) return [];
  if (!facets || facets.length === 0) return [{ text }];

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  const normalized = facets
    .map((facet) => ({
      start: Math.max(0, facet.index?.byteStart ?? 0),
      end: Math.min(bytes.length, facet.index?.byteEnd ?? 0),
      features: (facet.features ?? []).filter(isRecord),
    }))
    .filter((facet) => facet.end > facet.start);

  if (normalized.length === 0) return [{ text }];

  const bounds = new Set<number>([0, bytes.length]);
  for (const facet of normalized) {
    bounds.add(facet.start);
    bounds.add(facet.end);
  }

  const sorted = [...bounds].sort((a, b) => a - b);
  const spans: TimelineOptionalNoteSpan[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]!;
    const end = sorted[index + 1]!;
    const spanText = decoder.decode(bytes.slice(start, end));
    if (!spanText) continue;
    const span: TimelineOptionalNoteSpan = { text: spanText };
    for (const facet of normalized) {
      if (facet.start <= start && facet.end >= end) {
        for (const feature of facet.features) applyFeature(span, feature);
      }
    }
    spans.push(span);
  }
  return spans.length > 0 ? spans : [{ text }];
}

function blockType(block: JsonRecord): string | null {
  return stringField(block, "$type") ?? stringField(block, "__typename");
}

function isType(block: JsonRecord, normalized: string, typename: string): boolean {
  const type = blockType(block);
  return type === normalized || type === typename;
}

function blockText(block: JsonRecord): string {
  return stringField(block, "plaintext") ?? stringField(block, "text") ?? "";
}

function blockFacets(block: JsonRecord): NormalizedFacet[] | null {
  const facets = block.facets;
  return Array.isArray(facets) ? facets.filter(isRecord) as NormalizedFacet[] : null;
}

function childListItems(block: JsonRecord): TimelineOptionalNoteSpan[][] {
  const children = Array.isArray(block.children) ? block.children : [];
  return children.flatMap((child) => {
    if (!isRecord(child)) return [];
    const content = child.content;
    if (!isRecord(content)) return [];
    const spans = spansFromText(blockText(content), blockFacets(content));
    return spans.length > 0 ? [spans] : [];
  });
}

function imageSrcFromBlock(block: JsonRecord): string | null {
  const direct = safeImageSrc(stringField(block, "url") ?? stringField(block, "src") ?? stringField(block, "uri"));
  if (direct) return direct;

  const image = block.image;
  if (isRecord(image)) {
    return safeImageSrc(stringField(image, "uri") ?? stringField(image, "url") ?? stringField(image, "src"));
  }
  return null;
}

function linkFromBlock(block: JsonRecord): TimelineOptionalNoteBlock | null {
  const href = safeHttpHref(
    stringField(block, "url") ?? stringField(block, "src") ?? stringField(block, "href"),
  );
  if (!href) return null;
  return {
    type: "link",
    href,
    title: stringField(block, "title") ?? stringField(block, "text"),
    description: stringField(block, "description"),
  };
}

function noteBlockFromLeafletBlock(value: unknown, align?: string | null): TimelineOptionalNoteBlock[] {
  if (!isRecord(value)) return [];

  if (isType(value, "pub.leaflet.blocks.text", "PubLeafletBlocksText")) {
    const spans = spansFromText(blockText(value), blockFacets(value));
    return spans.length > 0 ? [{ type: "paragraph", spans, align }] : [];
  }

  if (isType(value, "pub.leaflet.blocks.header", "PubLeafletBlocksHeader")) {
    const spans = spansFromText(blockText(value), blockFacets(value));
    return spans.length > 0
      ? [{ type: "heading", level: numberField(value, "level") ?? 2, spans, align }]
      : [];
  }

  if (isType(value, "pub.leaflet.blocks.blockquote", "PubLeafletBlocksBlockquote")) {
    const spans = spansFromText(blockText(value), blockFacets(value));
    return spans.length > 0 ? [{ type: "blockquote", spans, align }] : [];
  }

  if (isType(value, "pub.leaflet.blocks.code", "PubLeafletBlocksCode")) {
    return [{ type: "code", text: blockText(value), language: stringField(value, "language") }];
  }

  if (isType(value, "pub.leaflet.blocks.image", "PubLeafletBlocksImage")) {
    const src = imageSrcFromBlock(value);
    return src ? [{ type: "image", src, alt: stringField(value, "alt") }] : [];
  }

  if (isType(value, "pub.leaflet.blocks.website", "PubLeafletBlocksWebsite")) {
    const link = linkFromBlock(value);
    return link ? [link] : [];
  }

  if (isType(value, "pub.leaflet.blocks.iframe", "PubLeafletBlocksIframe") || isType(value, "pub.leaflet.blocks.button", "PubLeafletBlocksButton")) {
    const link = linkFromBlock(value);
    return link ? [link] : [];
  }

  if (isType(value, "pub.leaflet.blocks.horizontalRule", "PubLeafletBlocksHorizontalRule")) {
    return [{ type: "hr" }];
  }

  if (isType(value, "pub.leaflet.blocks.unorderedList", "PubLeafletBlocksUnorderedList")) {
    const items = childListItems(value);
    return items.length > 0 ? [{ type: "list", ordered: false, items }] : [];
  }

  if (isType(value, "pub.leaflet.blocks.orderedList", "PubLeafletBlocksOrderedList")) {
    const items = childListItems(value);
    return items.length > 0 ? [{ type: "list", ordered: true, items }] : [];
  }

  return [];
}

function blocksFromLeafletDocument(document: JsonRecord): TimelineOptionalNoteBlock[] {
  const blocks = Array.isArray(document.blocks) ? document.blocks : [];
  return blocks.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const alignment = stringField(entry, "alignment");
    return noteBlockFromLeafletBlock(entry.block, alignment);
  });
}

function isDescriptionString(value: JsonRecord): boolean {
  return (
    stringField(value, "$type") === "org.hypercerts.defs#descriptionString" ||
    stringField(value, "__typename") === "OrgHypercertsDefsDescriptionString" ||
    typeof value.value === "string"
  );
}

function isLeafletDocument(value: JsonRecord): boolean {
  return (
    Array.isArray(value.blocks) &&
    (stringField(value, "$type") === "pub.leaflet.pages.linearDocument" ||
      stringField(value, "__typename") === "PubLeafletPagesLinearDocument" ||
      value.blocks.length >= 0)
  );
}

export function getTimelineOptionalNoteBlocks(note: unknown): TimelineOptionalNoteBlock[] {
  if (typeof note === "string") {
    const text = note.trim();
    return text ? [{ type: "paragraph", spans: [{ text }] }] : [];
  }

  if (!isRecord(note)) return [];

  if (isLeafletDocument(note)) {
    return blocksFromLeafletDocument(note);
  }

  if (isDescriptionString(note)) {
    const value = stringField(note, "value");
    if (!value) return [];
    const facets = Array.isArray(note.facets) ? note.facets.filter(isRecord) as NormalizedFacet[] : null;
    const spans = spansFromText(value, facets);
    return spans.length > 0 ? [{ type: "paragraph", spans }] : [];
  }

  return [];
}

export function hasTimelineOptionalNote(note: unknown): boolean {
  return getTimelineOptionalNoteBlocks(note).length > 0;
}
