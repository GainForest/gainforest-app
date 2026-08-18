#!/usr/bin/env node
/**
 * build-live-records.mjs
 * ─────────────────────────────────────────────────────────────
 * Snapshot the freshest Bumicert records from the GainForest
 * indexer for the Swissnex Day 2026 deck's "live records" slide.
 *
 * Why bake instead of fetch in-browser? Hyperlabel (the high-
 * quality scorer) doesn't set CORS headers, so a browser running
 * the deck off file:// or 127.0.0.1 would be blocked from
 * reading it. Baking sidesteps that AND guarantees the talk
 * works on a flaky conference WiFi.
 *
 * Pipeline (mirrors app/_lib/bumicerts.ts):
 *   1. GET hyperlabel /api/recent?tier=high-quality&limit=200
 *   2. Filter to the last 14 days by labeledAt
 *   3. For each, POST indexer.orgHypercertsClaimActivityByUri
 *      → title, shortDescription, image blob ref, createdAt
 *   4. Resolve each image blob via plc.directory → PDS blob URL
 *   5. Download every image into assets/live/<sha>.jpg
 *   6. Write a JSON snapshot to assets/live-records.json
 *
 * Re-run any time (e.g. the morning of the talk):
 *   node scripts/build-live-records.mjs
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECK_DIR  = path.resolve(__dirname, '..');
const ASSET_DIR = path.join(DECK_DIR, 'assets');
const LIVE_DIR  = path.join(ASSET_DIR, 'live');
const OUT_JSON  = path.join(ASSET_DIR, 'live-records.json');

const HYPERLABEL = 'https://hyperlabel-production.up.railway.app';
const INDEXER    = 'https://hi.gainforest.app/graphql';

const TARGET_COUNT  = 12;
const WINDOW_DAYS   = 14;
const MS_PER_DAY    = 24 * 60 * 60 * 1000;
const CUTOFF        = Date.now() - WINDOW_DAYS * MS_PER_DAY;

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

async function fetchHyperlabel() {
    const url = `${HYPERLABEL}/api/recent?limit=200&offset=0&tier=high-quality`;
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('hyperlabel ' + r.status);
    const j = await r.json();
    return { activities: j.activities ?? [], total: j.total ?? 0 };
}

const ACTIVITY_QUERY = `
  query LandingActivityByUri($uri: String!) {
    orgHypercertsClaimActivityByUri(uri: $uri) {
      did rkey uri createdAt title shortDescription
      image {
        __typename
        ... on OrgHypercertsDefsUri { uri }
        ... on OrgHypercertsDefsSmallImage { image { ref mimeType size } }
      }
    }
  }
`;

async function fetchActivity(uri) {
    try {
        const r = await fetch(INDEXER, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                operationName: 'LandingActivityByUri',
                query: ACTIVITY_QUERY,
                variables: { uri },
            }),
        });
        if (!r.ok) return null;
        const j = await r.json();
        return j.data?.orgHypercertsClaimActivityByUri ?? null;
    } catch (e) {
        return null;
    }
}

async function resolveImageUrl(did, image) {
    if (!image) return null;
    if (image.__typename === 'OrgHypercertsDefsUri') {
        return typeof image.uri === 'string' ? image.uri : null;
    }
    const ref = image.image?.ref;
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
        const ext = ct.includes('png') ? 'png'
                  : ct.includes('webp') ? 'webp'
                  : ct.includes('gif')  ? 'gif'
                  : 'jpg';
        const buf = Buffer.from(await r.arrayBuffer());
        const sha = createHash('sha1').update(buf).digest('hex').slice(0, 16);
        const filename = `${sha}.${ext}`;
        await mkdir(LIVE_DIR, { recursive: true });
        await writeFile(path.join(LIVE_DIR, filename), buf);
        return `assets/live/${filename}`;
    } catch (e) {
        return null;
    }
}

// ── main ────────────────────────────────────────────────────────

async function main() {
    console.log('[live] fetching hyperlabel high-quality feed…');
    const { activities, total } = await fetchHyperlabel();
    console.log(`[live] hyperlabel returned ${activities.length} activities (grand total: ${total})`);

    // Filter to the last 14 days by labeledAt
    const recent = activities.filter(a => {
        if (!a.labeledAt) return false;
        return new Date(a.labeledAt).getTime() >= CUTOFF;
    });
    console.log(`[live] ${recent.length} activities within last ${WINDOW_DAYS} days`);

    // Resolve each → indexer node
    const nodes = [];
    let processed = 0;
    for (const a of recent) {
        if (!a.did || !a.uri) continue;
        const node = await fetchActivity(a.uri);
        processed++;
        if (!node) continue;
        nodes.push({ ...node, hyperlabelTitle: a.title || null, labeledAt: a.labeledAt });
        if (nodes.length >= TARGET_COUNT * 3) break;  // grab enough to filter for images
        if (processed % 5 === 0) process.stdout.write('.');
    }
    process.stdout.write('\n');
    console.log(`[live] indexer resolved ${nodes.length} nodes`);

    // Sort by createdAt DESC and pick records with usable images first
    nodes.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    const records = [];
    for (const n of nodes) {
        const imageUrl = await resolveImageUrl(n.did, n.image);
        if (!imageUrl) {
            // Skip records without images for the visual feed
            continue;
        }
        process.stdout.write('↓');
        const localImage = await downloadImage(imageUrl);
        if (!localImage) continue;

        records.push({
            id: `${n.did}-${n.rkey}`,
            did: n.did,
            rkey: n.rkey,
            title: (n.title ?? n.hyperlabelTitle ?? 'Untitled').trim(),
            shortDescription: (n.shortDescription ?? '').trim(),
            createdAt: n.createdAt,
            image: localImage,
            atUri: n.uri,
        });
        if (records.length >= TARGET_COUNT) break;
    }
    process.stdout.write('\n');

    const snapshot = {
        generatedAt: new Date().toISOString(),
        windowDays: WINDOW_DAYS,
        hyperlabelTotal: total,
        countInWindow: recent.length,
        records,
    };

    await writeFile(OUT_JSON, JSON.stringify(snapshot, null, 2));
    console.log(`[live] wrote ${records.length} records → ${path.relative(DECK_DIR, OUT_JSON)}`);
    console.log(`[live] image folder → ${path.relative(DECK_DIR, LIVE_DIR)}`);
}

main().catch((e) => {
    console.error('[live] failed:', e);
    process.exit(1);
});
