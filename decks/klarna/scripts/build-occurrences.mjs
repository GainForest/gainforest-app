#!/usr/bin/env node
/**
 * build-occurrences.mjs
 * ─────────────────────────────────────────────────────────────
 * Snapshot the freshest `app.gainforest.dwc.occurrence` Darwin
 * Core biodiversity records — the actual species observations
 * that make up the GainForest data commons (~417k records and
 * counting across partner PDS instances).
 *
 * Pipeline (mirrors app/_lib/occurrences.ts's totalCount fetch,
 * extended to actually pull edges + images):
 *   1. POST indexer.appGainforestDwcOccurrence(first:N) — pages
 *      newest-first by createdAt, default sort.
 *   2. Keep only records with imageEvidence (blob ref present)
 *      because the slide is visual; species without a photo are
 *      summarised on the slide as the long tail (~95% of records
 *      are textual / coord-only).
 *   3. For each, resolve the imageEvidence blob ref via
 *      plc.directory → PDS sync URL.
 *   4. Download every image into assets/occurrences/<sha>.<ext>.
 *   5. Write JSON snapshot → assets/occurrence-records.json.
 *
 * Re-run any time:
 *   node scripts/build-occurrences.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR  = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(DECK_DIR, 'assets');
const OCC_DIR   = path.join(ASSET_DIR, 'occurrences');
const OUT_JSON  = path.join(ASSET_DIR, 'occurrence-records.json');

const INDEXER = 'https://hi.gainforest.app/graphql';

/** Per-page size when walking the indexer. */
const PAGE_SIZE    = 100;
/** Max pages to walk before giving up. The indexer is sorted newest-
 *  first by createdAt and we early-exit when we cross the 14-day
 *  cutoff anyway, so this is really just a safety cap. */
const MAX_PAGES    = 300;
/** Parallel image downloads. Each image comes from a community's
 *  own PDS, so we can fan out without hammering any one host. */
const DOWNLOAD_CONCURRENCY = 6;

/** Filter window: only records created in the last N days. */
const WINDOW_DAYS  = 14;
const MS_PER_DAY   = 24 * 60 * 60 * 1000;
const CUTOFF_MS    = Date.now() - WINDOW_DAYS * MS_PER_DAY;

/** Geographic bounding box around Greater Manaus / Amazonas state.
 *  Manaus city centre is roughly (-3.12, -60.02); Parque das Tribos
 *  (the Indigenous community where Taina was co-designed) is at
 *  (-2.99, -60.07). This box is generous enough to cover the
 *  surrounding Amazonas state forest stewards while excluding the
 *  rest of Brazil (e.g. São Paulo, Rio) and other continents. */
const MANAUS_BBOX = {
    latMin: -5.0,
    latMax: -1.5,
    lonMin: -62.0,
    lonMax: -57.0,
};

function inManausBbox(lat, lon) {
    if (lat == null || lon == null) return false;
    return lat >= MANAUS_BBOX.latMin && lat <= MANAUS_BBOX.latMax
        && lon >= MANAUS_BBOX.lonMin && lon <= MANAUS_BBOX.lonMax;
}
function inWindow(iso) {
    if (!iso) return false;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return false;
    return ms >= CUTOFF_MS;
}

// ── helpers ────────────────────────────────────────────────────

const plcCache = new Map();
async function resolvePdsHost(did) {
    if (plcCache.has(did)) return plcCache.get(did);
    try {
        const r = await fetch(`https://plc.directory/${did}`);
        if (!r.ok) { plcCache.set(did, null); return null; }
        const doc = await r.json();
        const ep = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint;
        const host = ep ? new URL(ep).host : null;
        plcCache.set(did, host);
        return host;
    } catch (e) {
        plcCache.set(did, null);
        return null;
    }
}

const OCCURRENCE_PAGE_QUERY = `
  query OccurrenceFeed($first: Int!, $after: String) {
    appGainforestDwcOccurrence(first: $first, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          did rkey createdAt eventDate eventTime
          scientificName vernacularName
          family genus kingdom phylum class order
          country countryCode locality
          decimalLatitude decimalLongitude
          coordinateUncertaintyInMeters
          basisOfRecord
          recordedBy
          identifiedBy
          conservationStatus {
            iucnCategory citesAppendix
          }
          imageEvidence {
            file { ref mimeType size }
          }
        }
      }
    }
  }
`;

async function fetchPage(after) {
    const r = await fetch(INDEXER, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            operationName: 'OccurrenceFeed',
            query: OCCURRENCE_PAGE_QUERY,
            variables: { first: PAGE_SIZE, after: after || null },
        }),
    });
    if (!r.ok) throw new Error('indexer ' + r.status);
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0]?.message || 'graphql error');
    return j.data?.appGainforestDwcOccurrence;
}

async function resolveImageUrl(did, image) {
    const ref = image?.file?.ref;
    if (!ref) return null;
    const host = await resolvePdsHost(did);
    if (!host) return null;
    return `https://${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(ref)}`;
}

async function downloadImage(url) {
    try {
        const r = await fetch(url, { redirect: 'follow' });
        if (!r.ok) return null;
        const ct = r.headers.get('content-type') || '';
        const ext = ct.includes('png')  ? 'png'
                  : ct.includes('webp') ? 'webp'
                  : ct.includes('gif')  ? 'gif'
                  :                       'jpg';
        const buf = Buffer.from(await r.arrayBuffer());
        const sha = createHash('sha1').update(buf).digest('hex').slice(0, 16);
        const filename = `${sha}.${ext}`;
        await mkdir(OCC_DIR, { recursive: true });
        await writeFile(path.join(OCC_DIR, filename), buf);
        return `assets/occurrences/${filename}`;
    } catch (e) {
        return null;
    }
}

// ── main ────────────────────────────────────────────────────────

async function main() {
    console.log(`[occ] paging app.gainforest.dwc.occurrence newest-first …`);
    console.log(`[occ] filter: last ${WINDOW_DAYS} days, bbox lat[${MANAUS_BBOX.latMin},${MANAUS_BBOX.latMax}] lon[${MANAUS_BBOX.lonMin},${MANAUS_BBOX.lonMax}] (Greater Manaus / Amazonas)`);

    /* Pass 1 — walk the indexer, collect every node that matches
       (last-14-days + in-bbox + has-image). No dedup, no caps:
       the user wants the full feed in the carousel. */
    const matches = [];                /* raw indexer nodes that pass the filter */
    let after = null;
    let totalCount = 0;
    let withImageScanned = 0;
    let outOfWindow = 0;
    let outOfBbox = 0;
    let pages = 0;
    /* Indexer is sorted newest-first by createdAt; the first time we
       see a record older than the 14-day window we can stop paging
       because everything further back will also be out-of-window. */
    let pastWindow = false;

    while (pages < MAX_PAGES && !pastWindow) {
        const page = await fetchPage(after);
        if (!page) break;
        totalCount = page.totalCount ?? totalCount;
        pages++;

        for (const edge of page.edges ?? []) {
            const n = edge.node;
            if (!inWindow(n.createdAt)) { outOfWindow++; pastWindow = true; continue; }
            if (!n?.imageEvidence?.file?.ref) continue;
            withImageScanned++;
            const lat = n.decimalLatitude != null ? Number(n.decimalLatitude) : null;
            const lon = n.decimalLongitude != null ? Number(n.decimalLongitude) : null;
            if (!inManausBbox(lat, lon)) { outOfBbox++; continue; }
            matches.push({ n, lat, lon });
        }

        if (!page.pageInfo?.hasNextPage) break;
        after = page.pageInfo.endCursor;
        if (pages % 5 === 0) process.stdout.write(`[p${pages}:${matches.length}]`);
    }
    process.stdout.write('\n');
    console.log(`[occ] pass 1 done: ${matches.length} matching nodes across ${pages} pages`);

    /* Pass 2 — resolve every match's image blob + download in
       parallel batches. Records whose image fails to resolve or
       download are silently dropped. */
    console.log(`[occ] pass 2: downloading ${matches.length} images (concurrency=${DOWNLOAD_CONCURRENCY})…`);
    const records = [];
    for (let i = 0; i < matches.length; i += DOWNLOAD_CONCURRENCY) {
        const batch = matches.slice(i, i + DOWNLOAD_CONCURRENCY);
        const settled = await Promise.all(batch.map(async ({ n, lat, lon }) => {
            const imageUrl = await resolveImageUrl(n.did, n.imageEvidence);
            if (!imageUrl) return null;
            const localImage = await downloadImage(imageUrl);
            if (!localImage) return null;
            return {
                id: `${n.did}-${n.rkey}`,
                did: n.did,
                rkey: n.rkey,
                createdAt: n.createdAt,
                eventDate: n.eventDate || null,
                eventTime: n.eventTime || null,
                scientificName: n.scientificName || null,
                vernacularName: n.vernacularName || null,
                family: n.family || null,
                genus:  n.genus  || null,
                kingdom:n.kingdom|| null,
                country: n.country || null,
                countryCode: n.countryCode || null,
                locality: n.locality || null,
                lat,
                lon,
                basisOfRecord: n.basisOfRecord || null,
                recordedBy: n.recordedBy || null,
                identifiedBy: n.identifiedBy || null,
                iucn: n.conservationStatus?.iucnCategory || null,
                cites: n.conservationStatus?.citesAppendix || null,
                image: localImage,
                atUri: `at://${n.did}/app.gainforest.dwc.occurrence/${n.rkey}`,
            };
        }));
        for (const r of settled) {
            if (r) {
                records.push(r);
                process.stdout.write('↓');
            } else {
                process.stdout.write('×');
            }
        }
    }
    process.stdout.write('\n');

    /* Tally a handful of headline numbers for the slide chrome. */
    const uniqueTaxa = new Set(records.map(r => r.scientificName).filter(Boolean));
    const uniqueDids = new Set(records.map(r => r.did));
    const uniqueCountries = new Set(records.map(r => r.countryCode || r.country).filter(Boolean));

    const snapshot = {
        generatedAt: new Date().toISOString(),
        collection: 'app.gainforest.dwc.occurrence',
        /** Global Darwin Core record count from the indexer (all communities). */
        totalCount,
        /** Filter that produced this snapshot. */
        filter: {
            windowDays: WINDOW_DAYS,
            bbox: MANAUS_BBOX,
            label: 'Greater Manaus / Amazonas',
        },
        /** Match counts at each filter stage. */
        matched: matches.length,
        scanned: withImageScanned,
        records,
        summary: {
            taxa: uniqueTaxa.size,
            communities: uniqueDids.size,
            countries: uniqueCountries.size,
        },
    };

    await writeFile(OUT_JSON, JSON.stringify(snapshot, null, 2));
    console.log(`[occ] wrote ${records.length} records → ${path.relative(DECK_DIR, OUT_JSON)}`);
    console.log(`[occ] image folder → ${path.relative(DECK_DIR, OCC_DIR)}`);
    console.log(`[occ] indexer totalCount = ${totalCount.toLocaleString('en-US')}`);
    console.log(`[occ] filter matched: ${matches.length} records (in-window + in-bbox + has-image)`);
    console.log(`[occ] dropped: ${outOfWindow} out-of-window, ${outOfBbox} out-of-bbox`);
    console.log(`[occ] summary: ${snapshot.summary.taxa} unique taxa · ${snapshot.summary.communities} communities`);
}

main().catch((e) => {
    console.error('[occ] failed:', e);
    process.exit(1);
});
