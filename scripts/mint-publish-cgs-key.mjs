#!/usr/bin/env node
// Mints the CGS API key that powers the Manage → Projects "Publish" button
// (see app/_lib/publish-org.ts). Run once as the OWNER of the GainForest CGS
// group, then set the printed key as GAINFOREST_CGS_API_KEY on Vercel.
//
// Usage:
//   OWNER_HANDLE=you.certified.one \
//   OWNER_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//   GAINFOREST_GROUP=gainforest.certified.one \
//   CGS_URL=https://dev.groups.certified.app \
//   node scripts/mint-publish-cgs-key.mjs
//
// - OWNER_HANDLE / OWNER_APP_PASSWORD: the personal account that OWNS the
//   GainForest group (keys.create is owner-only). Use an app password; you can
//   revoke it right after.
// - GAINFOREST_GROUP: handle or DID of the GainForest group repo.
// - CGS_URL: the Certified Group Service deployment (must match the
//   GAINFOREST_CGS_URL the app will use).
//
// The key is scope-limited to creating badge awards + definitions in that one
// group. The plaintext key is printed exactly once — store it immediately.

const OWNER_HANDLE = process.env.OWNER_HANDLE?.trim();
const OWNER_APP_PASSWORD = process.env.OWNER_APP_PASSWORD?.trim();
const GAINFOREST_GROUP = process.env.GAINFOREST_GROUP?.trim() || "did:plc:yjck2sybksyigp3zvbq7bfki";
const CGS_URL = (process.env.CGS_URL?.trim() || "https://dev.groups.certified.app").replace(/\/$/, "");
const PDS_URL = (process.env.PDS_URL?.trim() || "https://certified.one").replace(/\/$/, "");

if (!OWNER_HANDLE || !OWNER_APP_PASSWORD) {
  console.error("Set OWNER_HANDLE and OWNER_APP_PASSWORD (an app password of the group owner).");
  process.exit(1);
}

async function xrpc(base, method, { params, body, headers } = {}) {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const response = await fetch(`${base}/xrpc/${method}${qs}`, {
    method: body ? "POST" : "GET",
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} → ${response.status}: ${payload.message ?? payload.error ?? "unknown error"}`);
  return payload;
}

// 1. Sign in as the group owner on their PDS.
const session = await xrpc(PDS_URL, "com.atproto.server.createSession", {
  body: { identifier: OWNER_HANDLE, password: OWNER_APP_PASSWORD },
});
console.log(`signed in as ${session.did}`);

// 2. Service-auth JWT for keys.create, aud = the CGS service DID (supported,
//    non-deprecated targeting per the aud migration).
const cgsServiceDid = `did:web:${new URL(CGS_URL).host}`;
const { token } = await xrpc(PDS_URL, "com.atproto.server.getServiceAuth", {
  params: { aud: cgsServiceDid, lxm: "app.certified.group.keys.create" },
  headers: { authorization: `Bearer ${session.accessJwt}` },
});

// 3. Mint the key, scoped to exactly what publishing needs.
const created = await xrpc(CGS_URL, "app.certified.group.keys.create", {
  headers: { authorization: `Bearer ${token}` },
  body: {
    repo: GAINFOREST_GROUP,
    name: "certs-app publish button",
    scopes: [
      "repo:app.certified.badge.award?action=create",
      "repo:app.certified.badge.definition?action=create",
    ],
  },
});

console.log("\nAPI key minted. Shown ONCE — store it now:\n");
console.log(`  GAINFOREST_CGS_API_KEY=${created.key}`);
console.log(`  GAINFOREST_CGS_URL=${CGS_URL}`);
console.log("\nSet both on Vercel (and .env.local for local testing), then redeploy.");
