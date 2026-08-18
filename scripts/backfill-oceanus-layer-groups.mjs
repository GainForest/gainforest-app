#!/usr/bin/env node
// Backfills app.gainforest.organization.layerGroup records for Oceanus
// Conservation's repeat drone surveys (Tumanan ×3, Caguyao ×2) and stamps
// `groupRef` on the member layer records, per the redesigned lexicons
// (app/docs/lexicons/_schemas/app/gainforest/organization/). After this runs,
// the globe's time slider groups those flights by author intent instead of
// geometric inference.
//
// Reads are public; writes need the Oceanus account. Dry-run by default —
// prints the full plan without touching the repo.
//
// Usage:
//   node scripts/backfill-oceanus-layer-groups.mjs                # dry run
//   OCEANUS_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLY=1 \
//     node scripts/backfill-oceanus-layer-groups.mjs              # write
//
// Auth (either):
//   OCEANUS_APP_PASSWORD  app password for the account (identifier defaults
//                         to the handle; override with OCEANUS_IDENTIFIER)
//   OCEANUS_ACCESS_JWT    a ready bearer token for the account instead
//
// Idempotent: existing layerGroups with the same name are reused, layers whose
// groupRef already points at the right group are skipped, and putRecord uses
// CAS (swapRecord) so concurrent edits are never clobbered.

const PDS_URL = (process.env.PDS_URL ?? "https://climateai.org").replace(/\/$/, "");
const REPO_DID = process.env.OCEANUS_DID ?? "did:plc:6oxtzu7gxz7xcldvtwfh3bpt";
const IDENTIFIER = process.env.OCEANUS_IDENTIFIER ?? "oceanus-conservati.climateai.org";
const APPLY = process.env.APPLY === "1";

const LAYER = "app.gainforest.organization.layer";
const LAYER_GROUP = "app.gainforest.organization.layerGroup";

/** The monitored areas to declare. Members are matched by name — explicit and
 *  reviewable; the sanity block below refuses to run if the matches drift. */
const GROUPS = [
  { name: "Tumanan", match: /^Tumanan \(/, expectMembers: 3 },
  { name: "Caguyao", match: /^Caguyao \(/, expectMembers: 2 },
];

async function xrpc(method, { params, body, token } = {}) {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${PDS_URL}/xrpc/${method}${qs}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} -> ${res.status}: ${payload.message ?? payload.error ?? "unknown"}`);
  }
  return payload;
}

async function listAll(collection) {
  const records = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const params = { repo: REPO_DID, collection, limit: "100" };
    if (cursor) params.cursor = cursor;
    const json = await xrpc("com.atproto.repo.listRecords", { params });
    records.push(...(json.records ?? []));
    if (!json.cursor || (json.records ?? []).length === 0) break;
    cursor = json.cursor;
  }
  return records;
}

function parseBounds(raw) {
  const parts = String(raw ?? "").split(",").map((p) => Number(p.trim()));
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

function unionBounds(all) {
  const boxes = all.filter(Boolean);
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => [
    Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[2], b[2]), Math.max(a[3], b[3]),
  ]);
}

function captureDay(value) {
  const m = String(value.dataDate ?? value.capturedAt ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m?.[0] ?? null;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

const layers = await listAll(LAYER);
const existingGroups = await listAll(LAYER_GROUP);
console.log(`repo ${REPO_DID}: ${layers.length} layers, ${existingGroups.length} existing layerGroups\n`);

const plan = [];
for (const group of GROUPS) {
  const members = layers.filter((r) => group.match.test(String(r.value?.name ?? "")));
  const days = new Set(members.map((r) => captureDay(r.value)).filter(Boolean));

  // Sanity: refuse to write if the repo no longer looks like we expect.
  if (members.length !== group.expectMembers) {
    throw new Error(`${group.name}: expected ${group.expectMembers} member layers, found ${members.length} — review before running`);
  }
  if (days.size < 2) {
    throw new Error(`${group.name}: members span ${days.size} capture day(s); a time series needs >= 2`);
  }

  const bounds = unionBounds(members.map((r) => parseBounds(r.value?.bounds)));
  const existing = existingGroups.find((r) => r.value?.name === group.name);
  plan.push({
    ...group,
    members,
    bounds: bounds ? bounds.map((n) => String(n)).join(",") : undefined,
    existingUri: existing?.uri ?? null,
  });

  console.log(`── ${group.name}: ${members.length} flights over ${days.size} days (${[...days].sort().join(", ")})`);
  console.log(`   group record: ${existing ? `REUSE ${existing.uri}` : "CREATE"}  bounds=${bounds?.map((n) => n.toFixed(5)).join(",")}`);
  for (const r of members) {
    const state = r.value.groupRef
      ? existing && r.value.groupRef === existing.uri ? "ok (already set)" : `REPLACE ${r.value.groupRef}`
      : "SET groupRef";
    console.log(`   member ${r.uri.split("/").pop()}  ${String(r.value.name).padEnd(24)} ${state}`);
  }
  console.log();
}

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 and credentials to write.");
  process.exit(0);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

let token = process.env.OCEANUS_ACCESS_JWT?.trim();
if (!token) {
  const password = process.env.OCEANUS_APP_PASSWORD?.trim();
  if (!password) {
    console.error("Set OCEANUS_APP_PASSWORD (or OCEANUS_ACCESS_JWT) to write.");
    process.exit(1);
  }
  const session = await xrpc("com.atproto.server.createSession", {
    body: { identifier: IDENTIFIER, password },
  });
  if (session.did !== REPO_DID) {
    throw new Error(`signed in as ${session.did}, expected ${REPO_DID} — wrong account`);
  }
  token = session.accessJwt;
  console.log(`signed in as ${session.did}`);
}

// ── Write ────────────────────────────────────────────────────────────────────

for (const group of plan) {
  let groupUri = group.existingUri;
  if (!groupUri) {
    const created = await xrpc("com.atproto.repo.createRecord", {
      token,
      body: {
        repo: REPO_DID,
        collection: LAYER_GROUP,
        record: {
          $type: LAYER_GROUP,
          name: group.name,
          description: `Drone monitoring area — repeat captures of ${group.name} grouped into a change-over-time series.`,
          ...(group.bounds ? { bounds: group.bounds } : {}),
          createdAt: new Date().toISOString(),
        },
      },
    });
    groupUri = created.uri;
    console.log(`created layerGroup ${groupUri}`);
  }

  for (const record of group.members) {
    if (record.value.groupRef === groupUri) {
      console.log(`  skip ${record.value.name} (groupRef already set)`);
      continue;
    }
    await xrpc("com.atproto.repo.putRecord", {
      token,
      body: {
        repo: REPO_DID,
        collection: LAYER,
        rkey: record.uri.split("/").pop(),
        record: { ...record.value, groupRef: groupUri },
        swapRecord: record.cid,
      },
    });
    console.log(`  updated ${record.value.name} -> groupRef ${groupUri}`);
  }
}

console.log("\nBackfill complete.");
