/**
 * Mention (@-tag) helpers for feed posts and comments.
 *
 * Mentions ride on the standard Bluesky rich-text mechanism the
 * `app.gainforest.feed.post` lexicon already supports: a `facets` array whose
 * items carry a UTF-8 byte slice into `text` plus an
 * `app.bsky.richtext.facet#mention` feature holding the tagged account's DID.
 *
 * Unlike Bluesky (where a mention is an `@handle`), accounts here surface by
 * display name — so an inserted mention reads `@Jane Doe`. Because display
 * names can contain spaces, facets are the source of truth: they're computed
 * at submit time by scanning the text for the `@Name` tokens of accounts the
 * author actually picked from the type-ahead, and rendering linkifies those
 * same tokens using the (name, did) pairs recovered from the stored facets.
 * If the author edits a name fragment after picking it, that mention simply
 * degrades to plain text — nothing is ever tagged that wasn't picked.
 *
 * Everything in this module is pure and isomorphic (TextEncoder/TextDecoder
 * only), shared by the composer, the renderers, and the notifications layer.
 */

export const MENTION_FACET_TYPE = "app.bsky.richtext.facet#mention";

/** An account the author picked from the type-ahead: what `@Name` token to
 *  look for in the text, and which DID it links to. */
export type MentionCandidate = {
  did: string;
  name: string;
};

/** The `app.bsky.richtext.facet` shape we write into records. */
export type MentionFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: string; did: string }>;
};

/** The facet shape the hyperindex returns (feature union with __typename). */
export type RawIndexedFacet = {
  index?: { byteStart?: number | null; byteEnd?: number | null } | null;
  features?: Array<
    | { __typename?: string | null; $type?: string | null; did?: string | null }
    | null
  > | null;
} | null;

/** Maximum length of an active `@…` query while typing. */
const MAX_QUERY_LENGTH = 40;
/** Maximum mention facets written on one post/comment. */
const MAX_MENTIONS = 10;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function utf8Length(s: string): number {
  return encoder.encode(s).length;
}

// ── Typing detection ─────────────────────────────────────────────────────────

export type ActiveMentionQuery = {
  /** Index (JS string offset) of the `@` that opens the token. */
  start: number;
  /** Text between the `@` and the caret. */
  query: string;
};

/**
 * Find the `@query` token the caret is currently inside, if any — the trigger
 * for the type-ahead. The `@` must sit at the start of the text or after
 * whitespace/an opening bracket, and the query may contain at most one space
 * (display names are usually one or two words) and no line break or second `@`.
 */
export function detectMentionQuery(text: string, caret: number): ActiveMentionQuery | null {
  if (caret <= 0 || caret > text.length) return null;
  const upTo = text.slice(0, caret);
  const at = upTo.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0) {
    const before = upTo[at - 1];
    if (!/[\s([{"'\u2018\u201C]/.test(before)) return null;
  }
  const query = upTo.slice(at + 1);
  if (query.length > MAX_QUERY_LENGTH) return null;
  if (/[\n@]/.test(query)) return null;
  // Allow at most one internal space, and never end mid-double-space.
  const spaces = query.split(" ").length - 1;
  if (spaces > 1 || query.startsWith(" ") || query.includes("  ")) return null;
  return { start: at, query };
}

/**
 * Replace the active `@query` token (from `start` to `caret`) with the picked
 * account's `@Name ` and return the new text plus where the caret should land.
 */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const insertion = `@${name} `;
  const next = text.slice(0, start) + insertion + text.slice(caret);
  return { text: next, caret: start + insertion.length };
}

// ── Facet building (submit time) ─────────────────────────────────────────────

/** De-dupe candidates by (did, name), keeping the last pick. */
function dedupeCandidates(candidates: MentionCandidate[]): MentionCandidate[] {
  const map = new Map<string, MentionCandidate>();
  for (const c of candidates) {
    const name = c.name.trim();
    if (!c.did || !name) continue;
    map.set(`${c.did}\u0000${name}`, { did: c.did, name });
  }
  return [...map.values()];
}

/**
 * Scan `text` for the `@Name` tokens of the picked candidates and return the
 * mention facets to store on the record (UTF-8 byte slices, non-overlapping,
 * longest names claimed first so "@Jane Doe Senior" beats "@Jane Doe").
 * Returns undefined when nothing matches, so callers can omit the field.
 */
export function buildMentionFacets(
  text: string,
  candidates: MentionCandidate[],
): MentionFacet[] | undefined {
  const unique = dedupeCandidates(candidates).sort((a, b) => b.name.length - a.name.length);
  if (unique.length === 0) return undefined;

  const claimed: Array<[number, number]> = []; // JS string ranges already used
  const spans: Array<{ start: number; end: number; did: string }> = [];

  for (const candidate of unique) {
    const token = `@${candidate.name}`;
    let from = 0;
    while (spans.length < MAX_MENTIONS) {
      const idx = text.indexOf(token, from);
      if (idx === -1) break;
      from = idx + 1;
      const end = idx + token.length;
      // Token boundary: start of text or preceded by whitespace/bracket, and
      // not immediately followed by a word character that extends the name.
      if (idx > 0 && !/[\s([{"'\u2018\u201C]/.test(text[idx - 1])) continue;
      if (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) continue;
      if (claimed.some(([s, e]) => idx < e && end > s)) continue;
      claimed.push([idx, end]);
      spans.push({ start: idx, end, did: candidate.did });
    }
  }

  if (spans.length === 0) return undefined;
  spans.sort((a, b) => a.start - b.start);
  return spans.map((span) => ({
    index: {
      byteStart: utf8Length(text.slice(0, span.start)),
      byteEnd: utf8Length(text.slice(0, span.end)),
    },
    features: [{ $type: MENTION_FACET_TYPE, did: span.did }],
  }));
}

// ── Reading facets back (render + edit + notifications) ──────────────────────

/** The mention DID of a raw facet feature, tolerating both the record shape
 *  (`$type`) and the indexer shape (`__typename`). */
function featureMentionDid(
  feature: { __typename?: string | null; $type?: string | null; did?: string | null } | null | undefined,
): string | null {
  if (!feature?.did) return null;
  const type = feature.$type ?? feature.__typename ?? "";
  if (type === MENTION_FACET_TYPE || type === "AppBskyRichtextFacetMention") return feature.did;
  return null;
}

/** Every DID mentioned by a record's facets (for notifications). */
export function mentionDidsOfFacets(facets: RawIndexedFacet[] | null | undefined): string[] {
  const dids = new Set<string>();
  for (const facet of facets ?? []) {
    for (const feature of facet?.features ?? []) {
      const did = featureMentionDid(feature);
      if (did) dids.add(did);
    }
  }
  return [...dids];
}

/**
 * Recover (name, did) pairs from a record's raw text + stored facets, by
 * decoding each mention facet's byte slice back into its `@Name` token. These
 * candidates drive rendering (linkify `@Name` in possibly-clamped display
 * text) and seed the editor so an edit keeps existing tags intact.
 */
export function mentionCandidatesFromFacets(
  text: string,
  facets: RawIndexedFacet[] | null | undefined,
): MentionCandidate[] {
  if (!facets?.length || !text) return [];
  const bytes = encoder.encode(text);
  const out: MentionCandidate[] = [];
  for (const facet of facets) {
    const byteStart = facet?.index?.byteStart;
    const byteEnd = facet?.index?.byteEnd;
    if (typeof byteStart !== "number" || typeof byteEnd !== "number") continue;
    if (byteStart < 0 || byteEnd <= byteStart || byteEnd > bytes.length) continue;
    for (const feature of facet?.features ?? []) {
      const did = featureMentionDid(feature);
      if (!did) continue;
      const token = decoder.decode(bytes.slice(byteStart, byteEnd));
      const name = token.startsWith("@") ? token.slice(1).trim() : token.trim();
      if (name) out.push({ did, name });
    }
  }
  return dedupeCandidates(out);
}

// ── Display segmentation ─────────────────────────────────────────────────────

// ── Link segmentation ────────────────────────────────────────────────────────────────────────────

export type LinkSegment = {
  text: string;
  /** Set when this segment is a detected URL; always an https?:// href. */
  href?: string;
};

// Explicit scheme, or a bare/www domain on a small allowlist of common TLDs
// (kept conservative so ordinary prose — "e.g.", file names — never links).
const URL_PATTERN =
  /(?:https?:\/\/[^\s<>]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|app|io|dev|ai|co|earth|eco|xyz|info)\b(?:\/[^\s<>]*)?)/gi;

/** Punctuation a sentence leaves glued to a URL's tail ("see x.com!"). */
const TRAILING_PUNCT = /[.,;:!?…)\]}'"’”]+$/;

/**
 * Split plain display text into text and URL segments. Detects explicit
 * http(s) URLs plus bare domains like `gainforest.app` or `example.com`.
 * Skips email addresses and tokens glued to other text, and strips trailing
 * sentence punctuation from the link.
 */
export function segmentTextWithLinks(text: string): LinkSegment[] {
  if (!text) return [{ text }];
  const segments: LinkSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    if (start < cursor) continue;
    // Not a link if glued to a preceding word / @ (emails, user@host).
    const before = start > 0 ? text[start - 1] : "";
    if (before && /[\w@.\/-]/.test(before)) continue;
    const token = match[0].replace(TRAILING_PUNCT, "");
    if (!token) continue;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    const href = /^https?:\/\//i.test(token) ? token : `https://${token}`;
    segments.push({ text: token, href });
    cursor = start + token.length;
  }
  if (cursor < text.length || segments.length === 0) segments.push({ text: text.slice(cursor) });
  return segments;
}

export type MentionSegment = {
  text: string;
  /** Set when this segment is a mention token linking to an account. */
  did?: string;
};

/**
 * Split display text into plain and mention segments by scanning for the
 * `@Name` tokens of the given candidates. Works on clamped/normalized copies
 * of the original text too (it matches tokens, not byte offsets).
 */
export function segmentTextWithMentions(
  text: string,
  candidates: MentionCandidate[] | null | undefined,
): MentionSegment[] {
  if (!text) return [];
  const unique = dedupeCandidates(candidates ?? []).sort((a, b) => b.name.length - a.name.length);
  if (unique.length === 0) return [{ text }];

  const spans: Array<{ start: number; end: number; did: string }> = [];
  for (const candidate of unique) {
    const token = `@${candidate.name}`;
    let from = 0;
    for (;;) {
      const idx = text.indexOf(token, from);
      if (idx === -1) break;
      from = idx + 1;
      const end = idx + token.length;
      if (idx > 0 && !/[\s([{"'\u2018\u201C]/.test(text[idx - 1])) continue;
      if (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) continue;
      if (spans.some((s) => idx < s.end && end > s.start)) continue;
      spans.push({ start: idx, end, did: candidate.did });
    }
  }

  if (spans.length === 0) return [{ text }];
  spans.sort((a, b) => a.start - b.start);

  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) segments.push({ text: text.slice(cursor, span.start) });
    segments.push({ text: text.slice(span.start, span.end), did: span.did });
    cursor = span.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
