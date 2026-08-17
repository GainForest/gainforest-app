/**
 * Rich text serialization for `pub.leaflet.pages.linearDocument` records.
 *
 * The WYSIWYG update composer edits ordinary HTML in a contentEditable
 * surface; these helpers convert that DOM into the Leaflet block model our
 * lexicons reference (`pub.leaflet.blocks.*` + `pub.leaflet.richtext.facet`),
 * and back into sanitized editor HTML for pasting and previewing. Facet
 * ranges are byte offsets into the UTF-8 encoded plaintext, exactly as the
 * facet lexicon requires.
 *
 * The pure functions here (segment merging, facet byte math, plaintext
 * extraction, HTML rendering) are unit-tested without a DOM; only the two
 * `*FromEditor*` entry points touch DOM APIs and run in the browser.
 */

// ── Leaflet record types ────────────────────────────────────────────────────

export type LeafletFacetFeature =
  | { $type: "pub.leaflet.richtext.facet#bold" }
  | { $type: "pub.leaflet.richtext.facet#italic" }
  | { $type: "pub.leaflet.richtext.facet#underline" }
  | { $type: "pub.leaflet.richtext.facet#strikethrough" }
  | { $type: "pub.leaflet.richtext.facet#code" }
  | { $type: "pub.leaflet.richtext.facet#link"; uri: string };

export type LeafletFacet = {
  index: { byteStart: number; byteEnd: number };
  features: LeafletFacetFeature[];
};

export type LeafletTextBlock = {
  $type: "pub.leaflet.blocks.text";
  plaintext: string;
  facets?: LeafletFacet[];
};

export type LeafletHeaderBlock = {
  $type: "pub.leaflet.blocks.header";
  level: number;
  plaintext: string;
  facets?: LeafletFacet[];
};

export type LeafletBlockquoteBlock = {
  $type: "pub.leaflet.blocks.blockquote";
  plaintext: string;
  facets?: LeafletFacet[];
};

export type LeafletCodeBlock = {
  $type: "pub.leaflet.blocks.code";
  plaintext: string;
  language?: string;
};

export type LeafletHorizontalRuleBlock = {
  $type: "pub.leaflet.blocks.horizontalRule";
};

export type LeafletListItem = {
  content: LeafletTextBlock;
  children?: LeafletListItem[];
};

export type LeafletListBlock = {
  $type: "pub.leaflet.blocks.unorderedList" | "pub.leaflet.blocks.orderedList";
  children: LeafletListItem[];
};

export type LeafletBlock =
  | LeafletTextBlock
  | LeafletHeaderBlock
  | LeafletBlockquoteBlock
  | LeafletCodeBlock
  | LeafletHorizontalRuleBlock
  | LeafletListBlock;

export type LeafletDocumentBlock = {
  $type: "pub.leaflet.pages.linearDocument#block";
  block: LeafletBlock;
};

export type LeafletLinearDocument = {
  $type: "pub.leaflet.pages.linearDocument";
  blocks: LeafletDocumentBlock[];
};

// ── Inline segment model ────────────────────────────────────────────────────

export type RichInlineMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Absolute http(s) URL. */
  link?: string;
};

export type RichInlineSegment = { text: string; marks: RichInlineMarks };

function marksEqual(a: RichInlineMarks, b: RichInlineMarks): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    Boolean(a.code) === Boolean(b.code) &&
    (a.link ?? null) === (b.link ?? null)
  );
}

function hasMarks(marks: RichInlineMarks): boolean {
  return Boolean(
    marks.bold || marks.italic || marks.underline || marks.strike || marks.code || marks.link,
  );
}

export function mergeInlineSegments(segments: RichInlineSegment[]): RichInlineSegment[] {
  const merged: RichInlineSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const last = merged[merged.length - 1];
    if (last && marksEqual(last.marks, segment.marks)) {
      last.text += segment.text;
    } else {
      merged.push({ text: segment.text, marks: { ...segment.marks } });
    }
  }
  return merged;
}

/** Trim whitespace from the block edges without disturbing inner offsets. */
export function trimInlineSegments(segments: RichInlineSegment[]): RichInlineSegment[] {
  const trimmed = segments.map((segment) => ({ ...segment, marks: { ...segment.marks } }));

  while (trimmed.length > 0) {
    const first = trimmed[0]!;
    first.text = first.text.replace(/^\s+/, "");
    if (first.text) break;
    trimmed.shift();
  }

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1]!;
    last.text = last.text.replace(/\s+$/, "");
    if (last.text) break;
    trimmed.pop();
  }

  return trimmed;
}

function featuresFromMarks(marks: RichInlineMarks): LeafletFacetFeature[] {
  const features: LeafletFacetFeature[] = [];
  if (marks.bold) features.push({ $type: "pub.leaflet.richtext.facet#bold" });
  if (marks.italic) features.push({ $type: "pub.leaflet.richtext.facet#italic" });
  if (marks.underline) features.push({ $type: "pub.leaflet.richtext.facet#underline" });
  if (marks.strike) features.push({ $type: "pub.leaflet.richtext.facet#strikethrough" });
  if (marks.code) features.push({ $type: "pub.leaflet.richtext.facet#code" });
  if (marks.link) features.push({ $type: "pub.leaflet.richtext.facet#link", uri: marks.link });
  return features;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/** Collapse segments into `{ plaintext, facets }` with UTF-8 byte offsets. */
export function plaintextWithFacetsFromSegments(segments: RichInlineSegment[]): {
  plaintext: string;
  facets: LeafletFacet[];
} {
  const merged = mergeInlineSegments(trimInlineSegments(segments));
  let plaintext = "";
  let byteOffset = 0;
  const facets: LeafletFacet[] = [];

  for (const segment of merged) {
    const byteLength = utf8Encoder.encode(segment.text).length;
    if (hasMarks(segment.marks)) {
      facets.push({
        index: { byteStart: byteOffset, byteEnd: byteOffset + byteLength },
        features: featuresFromMarks(segment.marks),
      });
    }
    plaintext += segment.text;
    byteOffset += byteLength;
  }

  return { plaintext, facets };
}

/**
 * Split a block's plaintext back into marked segments using its facets.
 * Inverse of {@link plaintextWithFacetsFromSegments}; tolerant of unknown
 * feature shapes so it can also consume documents written elsewhere.
 */
export function inlineSegmentsFromPlaintext(
  plaintext: string,
  facets: LeafletFacet[] | undefined,
): RichInlineSegment[] {
  if (!plaintext) return [];
  if (!facets || facets.length === 0) return [{ text: plaintext, marks: {} }];

  const bytes = utf8Encoder.encode(plaintext);
  const normalized = facets
    .map((facet) => ({
      start: Math.max(0, Math.min(bytes.length, facet.index?.byteStart ?? 0)),
      end: Math.max(0, Math.min(bytes.length, facet.index?.byteEnd ?? 0)),
      features: facet.features ?? [],
    }))
    .filter((facet) => facet.end > facet.start);

  if (normalized.length === 0) return [{ text: plaintext, marks: {} }];

  const bounds = new Set<number>([0, bytes.length]);
  for (const facet of normalized) {
    bounds.add(facet.start);
    bounds.add(facet.end);
  }

  const sorted = [...bounds].sort((a, b) => a - b);
  const segments: RichInlineSegment[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]!;
    const end = sorted[index + 1]!;
    const text = utf8Decoder.decode(bytes.slice(start, end));
    if (!text) continue;
    const marks: RichInlineMarks = {};
    for (const facet of normalized) {
      if (facet.start > start || facet.end < end) continue;
      for (const feature of facet.features) {
        const type = (feature as { $type?: string }).$type;
        if (type === "pub.leaflet.richtext.facet#bold") marks.bold = true;
        if (type === "pub.leaflet.richtext.facet#italic") marks.italic = true;
        if (type === "pub.leaflet.richtext.facet#underline") marks.underline = true;
        if (type === "pub.leaflet.richtext.facet#strikethrough") marks.strike = true;
        if (type === "pub.leaflet.richtext.facet#code") marks.code = true;
        if (type === "pub.leaflet.richtext.facet#link") {
          const uri = (feature as { uri?: unknown }).uri;
          if (typeof uri === "string" && uri) marks.link = uri;
        }
      }
    }
    segments.push({ text, marks });
  }
  return segments.length > 0 ? segments : [{ text: plaintext, marks: {} }];
}

// ── Document helpers ────────────────────────────────────────────────────────

function listItemPlaintext(item: LeafletListItem): string[] {
  const lines = [item.content?.plaintext ?? ""];
  for (const child of item.children ?? []) lines.push(...listItemPlaintext(child));
  return lines;
}

/** All human-readable text in the document, newline-joined across blocks. */
export function leafletDocumentPlaintext(document: LeafletLinearDocument | null | undefined): string {
  if (!document) return "";
  const lines: string[] = [];
  for (const entry of document.blocks) {
    const block = entry.block;
    if (
      block.$type === "pub.leaflet.blocks.text" ||
      block.$type === "pub.leaflet.blocks.header" ||
      block.$type === "pub.leaflet.blocks.blockquote" ||
      block.$type === "pub.leaflet.blocks.code"
    ) {
      lines.push(block.plaintext);
    } else if (
      block.$type === "pub.leaflet.blocks.unorderedList" ||
      block.$type === "pub.leaflet.blocks.orderedList"
    ) {
      for (const item of block.children) lines.push(...listItemPlaintext(item));
    }
  }
  return lines.join("\n").trim();
}

export function leafletDocumentHasText(
  document: LeafletLinearDocument | null | undefined,
): document is LeafletLinearDocument {
  return leafletDocumentPlaintext(document).length > 0;
}

function documentBlock(block: LeafletBlock): LeafletDocumentBlock {
  return { $type: "pub.leaflet.pages.linearDocument#block", block };
}

function textBlockFromSegments(segments: RichInlineSegment[]): LeafletTextBlock | null {
  const { plaintext, facets } = plaintextWithFacetsFromSegments(segments);
  if (!plaintext) return null;
  return {
    $type: "pub.leaflet.blocks.text",
    plaintext,
    ...(facets.length > 0 ? { facets } : {}),
  };
}

/** One text block per paragraph — how plain captions become Leaflet documents. */
export function leafletDocumentFromPlainText(text: string): LeafletLinearDocument {
  const paragraphs = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return {
    $type: "pub.leaflet.pages.linearDocument",
    blocks: (paragraphs.length > 0 ? paragraphs : [text]).map((plaintext) =>
      documentBlock({ $type: "pub.leaflet.blocks.text", plaintext }),
    ),
  };
}

// ── DOM → Leaflet blocks ────────────────────────────────────────────────────

const HEADING_TAGS: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "HEAD",
  "META",
  "LINK",
  "TITLE",
  "IMG",
  "PICTURE",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "CANVAS",
  "SVG",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
]);

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "PRE",
  "HR",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TD",
  "TH",
  "SECTION",
  "ARTICLE",
  "ASIDE",
  "HEADER",
  "FOOTER",
  "MAIN",
  "NAV",
  "FIGURE",
  "FIGCAPTION",
  "ADDRESS",
  "DL",
  "DT",
  "DD",
]);

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function safeLinkHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Marks contributed by one element — semantic tags plus the inline styles
 *  word processors paste (Google Docs writes `<span style="font-weight:700">`). */
function marksFromElement(element: HTMLElement, marks: RichInlineMarks): RichInlineMarks {
  const next: RichInlineMarks = { ...marks };
  const tag = element.tagName;
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U" || tag === "INS") next.underline = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.strike = true;
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP") next.code = true;
  if (tag === "A") {
    const href = safeLinkHref(element.getAttribute("href"));
    if (href) next.link = href;
  }

  const style = element.style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === "bold" || weight === "bolder" || Number.parseInt(weight, 10) >= 600) {
      next.bold = true;
    }
    // Google Docs wraps whole pastes in `<b style="font-weight:normal">` —
    // an explicit normal weight must beat the tag.
    if (weight === "normal" || Number.parseInt(weight, 10) === 400) next.bold = false;
    if (style.fontStyle === "italic" || style.fontStyle === "oblique") next.italic = true;
    const decoration = `${style.textDecoration} ${style.textDecorationLine}`;
    if (decoration.includes("underline")) next.underline = true;
    if (decoration.includes("line-through")) next.strike = true;
  }

  return next;
}

/** A separator emitted at a nested block boundary; adjacent separators are
 *  collapsed so `<blockquote><p>a</p><p>b</p></blockquote>` yields one "\n". */
type InternalSegment = RichInlineSegment & { boundary?: boolean };

/** Collect the inline segments of a subtree. Nested block boundaries become
 *  newline segments, so a blockquote of several paragraphs keeps its shape. */
function collectInlineSegments(
  node: Node,
  marks: RichInlineMarks,
  out: InternalSegment[],
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\u00A0/g, " ");
    if (text) out.push({ text, marks });
    return;
  }

  if (!isElement(node) || SKIPPED_TAGS.has(node.tagName)) return;

  if (node.tagName === "BR") {
    out.push({ text: "\n", marks });
    return;
  }

  const isBlock = BLOCK_TAGS.has(node.tagName);
  if (isBlock && out.length > 0) out.push({ text: "\n", marks: {}, boundary: true });

  const nextMarks = marksFromElement(node, marks);
  for (const child of Array.from(node.childNodes)) {
    collectInlineSegments(child, nextMarks, out);
  }

  if (isBlock && out.length > 0) out.push({ text: "\n", marks: {}, boundary: true });
}

function collapseBoundarySegments(segments: InternalSegment[]): RichInlineSegment[] {
  const out: RichInlineSegment[] = [];
  for (const segment of segments) {
    if (segment.boundary) {
      const last = out[out.length - 1];
      if (!last || last.text.endsWith("\n")) continue;
      out.push({ text: "\n", marks: {} });
      continue;
    }
    out.push({ text: segment.text, marks: segment.marks });
  }
  return out;
}

function segmentsFromNodes(nodes: Node[]): RichInlineSegment[] {
  const segments: InternalSegment[] = [];
  for (const node of nodes) collectInlineSegments(node, {}, segments);
  return collapseBoundarySegments(segments);
}

function listItemsFromList(listElement: HTMLElement): LeafletListItem[] {
  const items: LeafletListItem[] = [];
  for (const child of Array.from(listElement.children)) {
    if (child.tagName === "UL" || child.tagName === "OL") {
      // A list nested directly in a list (no wrapping li) — lift its items up.
      items.push(...listItemsFromList(child as HTMLElement));
      continue;
    }
    if (child.tagName !== "LI") continue;

    const inlineNodes: Node[] = [];
    const nestedLists: HTMLElement[] = [];
    for (const itemChild of Array.from(child.childNodes)) {
      if (isElement(itemChild) && (itemChild.tagName === "UL" || itemChild.tagName === "OL")) {
        nestedLists.push(itemChild);
      } else {
        inlineNodes.push(itemChild);
      }
    }

    const content = textBlockFromSegments(segmentsFromNodes(inlineNodes));
    const children = nestedLists.flatMap((nested) => listItemsFromList(nested));
    if (!content && children.length === 0) continue;
    items.push({
      content: content ?? { $type: "pub.leaflet.blocks.text", plaintext: "" },
      ...(children.length > 0 ? { children } : {}),
    });
  }
  return items;
}

function hasBlockChildren(element: HTMLElement): boolean {
  return Array.from(element.children).some((child) => BLOCK_TAGS.has(child.tagName));
}

function blocksFromContainer(container: HTMLElement): LeafletBlock[] {
  const blocks: LeafletBlock[] = [];
  let pendingInline: Node[] = [];

  const flushInline = () => {
    if (pendingInline.length === 0) return;
    const block = textBlockFromSegments(segmentsFromNodes(pendingInline));
    if (block) blocks.push(block);
    pendingInline = [];
  };

  for (const node of Array.from(container.childNodes)) {
    if (!isElement(node)) {
      pendingInline.push(node);
      continue;
    }

    if (SKIPPED_TAGS.has(node.tagName)) continue;

    if (!BLOCK_TAGS.has(node.tagName)) {
      // Word processors wrap whole documents in inline tags (Google Docs
      // pastes `<b style="font-weight:normal"><p>…</p></b>`). An "inline"
      // element holding block children is really a container — recurse so
      // its paragraphs and lists survive as separate blocks.
      if (hasBlockChildren(node)) {
        flushInline();
        blocks.push(...blocksFromContainer(node));
        continue;
      }
      pendingInline.push(node);
      continue;
    }

    flushInline();
    const tag = node.tagName;

    if (tag in HEADING_TAGS) {
      const { plaintext, facets } = plaintextWithFacetsFromSegments(segmentsFromNodes([...node.childNodes]));
      if (plaintext) {
        blocks.push({
          $type: "pub.leaflet.blocks.header",
          level: HEADING_TAGS[tag]!,
          plaintext,
          ...(facets.length > 0 ? { facets } : {}),
        });
      }
      continue;
    }

    if (tag === "BLOCKQUOTE") {
      const { plaintext, facets } = plaintextWithFacetsFromSegments(segmentsFromNodes([...node.childNodes]));
      if (plaintext) {
        blocks.push({
          $type: "pub.leaflet.blocks.blockquote",
          plaintext,
          ...(facets.length > 0 ? { facets } : {}),
        });
      }
      continue;
    }

    if (tag === "UL" || tag === "OL") {
      const children = listItemsFromList(node);
      if (children.length > 0) {
        blocks.push({
          $type: tag === "UL" ? "pub.leaflet.blocks.unorderedList" : "pub.leaflet.blocks.orderedList",
          children,
        });
      }
      continue;
    }

    if (tag === "PRE") {
      const plaintext = (node.textContent ?? "").replace(/\u00A0/g, " ").replace(/\s+$/, "");
      if (plaintext.trim()) blocks.push({ $type: "pub.leaflet.blocks.code", plaintext });
      continue;
    }

    if (tag === "HR") {
      blocks.push({ $type: "pub.leaflet.blocks.horizontalRule" });
      continue;
    }

    if ((tag === "P" || tag === "DIV") && !hasBlockChildren(node)) {
      const block = textBlockFromSegments(segmentsFromNodes([...node.childNodes]));
      if (block) blocks.push(block);
      continue;
    }

    // Any other block container (div wrappers, tables, sections …): recurse so
    // its inner paragraphs survive.
    blocks.push(...blocksFromContainer(node));
  }

  flushInline();

  // A document that is only horizontal rules carries no text — drop them.
  const hasText = blocks.some((block) => block.$type !== "pub.leaflet.blocks.horizontalRule");
  return hasText ? blocks : [];
}

/** Serialize the live editor DOM. Returns null when there is no actual text. */
export function leafletDocumentFromEditorRoot(root: HTMLElement): LeafletLinearDocument | null {
  const blocks = blocksFromContainer(root);
  if (blocks.length === 0) return null;
  const document: LeafletLinearDocument = {
    $type: "pub.leaflet.pages.linearDocument",
    blocks: blocks.map(documentBlock),
  };
  return leafletDocumentHasText(document) ? document : null;
}

// ── Leaflet blocks → editor HTML ────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineHtmlFromSegments(segments: RichInlineSegment[]): string {
  return segments
    .map((segment) => {
      let html = escapeHtml(segment.text).replace(/\n/g, "<br>");
      if (segment.marks.code) html = `<code>${html}</code>`;
      if (segment.marks.strike) html = `<s>${html}</s>`;
      if (segment.marks.underline) html = `<u>${html}</u>`;
      if (segment.marks.italic) html = `<em>${html}</em>`;
      if (segment.marks.bold) html = `<strong>${html}</strong>`;
      const href = safeLinkHref(segment.marks.link ?? null);
      if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
      return html;
    })
    .join("");
}

function inlineHtmlFromBlock(block: { plaintext: string; facets?: LeafletFacet[] }): string {
  return inlineHtmlFromSegments(inlineSegmentsFromPlaintext(block.plaintext, block.facets));
}

function listHtml(items: LeafletListItem[], tag: "ul" | "ol"): string {
  const itemsHtml = items
    .map((item) => {
      const content = inlineHtmlFromBlock(item.content ?? { plaintext: "" });
      const nested = item.children?.length ? listHtml(item.children, tag) : "";
      return `<li>${content}${nested}</li>`;
    })
    .join("");
  return `<${tag}>${itemsHtml}</${tag}>`;
}

/**
 * Render a Leaflet document as the minimal HTML vocabulary the editor
 * understands. Everything is escaped, so this is safe to hand to
 * `insertHTML` — it is how pasted rich text gets sanitized.
 */
export function editorHtmlFromLeafletDocument(document: LeafletLinearDocument): string {
  return document.blocks
    .map(({ block }) => {
      switch (block.$type) {
        case "pub.leaflet.blocks.text":
          return `<p>${inlineHtmlFromBlock(block)}</p>`;
        case "pub.leaflet.blocks.header": {
          const level = Math.min(Math.max(block.level ?? 2, 1), 6);
          return `<h${level}>${inlineHtmlFromBlock(block)}</h${level}>`;
        }
        case "pub.leaflet.blocks.blockquote":
          return `<blockquote>${inlineHtmlFromBlock(block)}</blockquote>`;
        case "pub.leaflet.blocks.code":
          return `<pre>${escapeHtml(block.plaintext)}</pre>`;
        case "pub.leaflet.blocks.horizontalRule":
          return "<hr>";
        case "pub.leaflet.blocks.unorderedList":
          return listHtml(block.children, "ul");
        case "pub.leaflet.blocks.orderedList":
          return listHtml(block.children, "ol");
        default:
          return "";
      }
    })
    .join("");
}

/**
 * Normalize arbitrary clipboard HTML down to the editor's vocabulary by
 * round-tripping it through the Leaflet block model. Returns null when the
 * clipboard carries no usable rich content.
 */
export function sanitizedEditorHtmlFromClipboard(html: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const document = leafletDocumentFromEditorRoot(parsed.body);
  if (!document) return null;
  return editorHtmlFromLeafletDocument(document);
}
