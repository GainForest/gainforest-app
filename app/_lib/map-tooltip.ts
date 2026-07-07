/**
 * Rich Leaflet hover tooltips for the maps — a hyperscan-style preview card with
 * the record's photo, name, a couple of context badges, the date it happened,
 * and its coordinates. Shared by the multi-record stream map (RecordMap) and the
 * single-pin detail map (RecordLocationMap).
 *
 * The card markup is plain HTML (Leaflet tooltips are HTML strings, not React),
 * so any user-facing copy is passed in already-translated via `MapTipLabels`.
 * The photo blob is resolved lazily from the owner's PDS on hover and swapped in,
 * cached per record so re-opening the tooltip is instant.
 */

import type { ExplorerRecord } from "./indexer";
import { resolveBlobUrl } from "./pds";
import { formatDate } from "./format";

/** Translated strings the tooltip needs (it lives outside React). */
export type MapTipLabels = {
  /** Fallback species/title when a sighting carries no name. */
  unidentified: string;
};

/** Hovered-point coordinates, shown in the card footer. */
export type MapTipPoint = { lat: number; lon: number };

const esc = (s: string | null | undefined): string =>
  (s ?? "").replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const LEAF_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M17.66 16.66L13.41 20.9a2 2 0 01-2.82 0l-4.25-4.24a8 8 0 1111.32 0z"/><circle cx="12" cy="11" r="2.6"/></svg>';

// Photo blobs resolved on hover, cached by record id so the tooltip only ever
// fetches a given record's image once across opens.
const blobUrlCache = new Map<string, string>();

function recordImageUrl(record: ExplorerRecord): string | null {
  return record.imageUrl ?? blobUrlCache.get(record.id) ?? null;
}

function recordImageRef(record: ExplorerRecord): string | null {
  if (record.kind === "site") return record.coverRef ?? record.logoRef ?? null;
  return record.imageRef ?? null;
}

function recordTitle(record: ExplorerRecord, labels: MapTipLabels): string {
  switch (record.kind) {
    case "occurrence":
      return record.scientificName || record.vernacularName || labels.unidentified;
    case "site":
      return record.name;
    default:
      return record.title;
  }
}

/** Smaller line under the title — a common name, country, or short blurb. */
function recordSubtitle(record: ExplorerRecord): string | null {
  switch (record.kind) {
    case "occurrence":
      return record.vernacularName && record.scientificName ? record.vernacularName : null;
    case "site":
      return record.country;
    case "bumicert":
      return record.shortDescription;
    default:
      return null;
  }
}

/** The moment the record represents, for the card's date stamp. */
function recordWhen(record: ExplorerRecord): string | null {
  switch (record.kind) {
    case "occurrence":
      return record.eventDate || record.createdAt;
    case "bumicert":
      return record.startDate || record.createdAt;
    default:
      return record.createdAt;
  }
}

/** Epoch ms used to position a record on the timeline; null when undatable. */
export function recordTimestamp(record: ExplorerRecord): number | null {
  const raw = recordWhen(record);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/** Epoch ms of the upload time (createdAt). Used as the timeline axis when every
 *  record shares one eventDate (bulk uploads) so there is still a range to scrub. */
export function recordCreatedTimestamp(record: ExplorerRecord): number | null {
  const raw = record.createdAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

function recordBadges(record: ExplorerRecord): string {
  if (record.kind === "occurrence") {
    return [
      record.kingdom ? `<span class="gf-occ-badge k">${esc(record.kingdom)}</span>` : "",
      record.family ? `<span class="gf-occ-badge f">${esc(record.family)}</span>` : "",
    ].join("");
  }
  if (record.kind === "site" && record.orgType) {
    return `<span class="gf-occ-badge k">${esc(record.orgType)}</span>`;
  }
  return "";
}

/** Build the full preview-card HTML for a record at the given point. */
export function recordTipHtml(
  record: ExplorerRecord,
  point: MapTipPoint,
  labels: MapTipLabels,
): string {
  const image = recordImageUrl(record);
  const media = image
    ? `<img src="${esc(image)}" class="gf-occ-img" loading="lazy" alt="" />`
    : `<div class="gf-occ-ph">${LEAF_SVG}</div>`;
  const title = recordTitle(record, labels);
  const subtitle = recordSubtitle(record);
  const sub = subtitle ? `<div class="gf-occ-sub">${esc(subtitle)}</div>` : "";
  const badges = recordBadges(record);
  const when = recordWhen(record);
  const whenHtml = when ? `<span class="gf-occ-when">${esc(formatDate(when))}</span>` : "";
  const meta = badges || whenHtml ? `<div class="gf-occ-meta">${badges}${whenHtml}</div>` : "";
  return (
    `<div class="gf-occ-media">${media}</div>` +
    `<div class="gf-occ-body">` +
    `<div class="gf-occ-title">${esc(title)}</div>${sub}` +
    `${meta}` +
    `<div class="gf-occ-coords">${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}</div>` +
    `</div>`
  );
}

/**
 * On hover, lazily resolve the record's PDS photo and swap it into the open
 * tooltip. No-op when the record already has an image or carries no blob ref.
 */
export async function hydrateRecordTip(
  // A marker or any Leaflet layer (e.g. a GeoJSON polygon) carrying the tooltip.
  target: { setTooltipContent(content: string): unknown },
  record: ExplorerRecord,
  point: MapTipPoint,
  labels: MapTipLabels,
): Promise<void> {
  if (recordImageUrl(record)) return;
  const ref = recordImageRef(record);
  if (!ref) return;
  const url = await resolveBlobUrl(record.did, ref).catch(() => null);
  if (!url) return;
  blobUrlCache.set(record.id, url);
  try {
    target.setTooltipContent(recordTipHtml(record, point, labels));
  } catch {
    /* tooltip may have been torn down before the blob resolved */
  }
}
