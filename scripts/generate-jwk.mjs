#!/usr/bin/env node
// Generate a JWKS for ATPROTO_JWK_PRIVATE.
//
// Usage:
//   node scripts/generate-jwk.mjs > .env.local.jwk
//   then paste the printed line into .env.local.
//
// Port of simocracy-v2/scripts/generate-jwk.mjs.

import { generateKeyPairSync, randomBytes } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});

const jwk = privateKey.export({ format: "jwk" });
jwk.use = "sig";
jwk.alg = "ES256";
jwk.kid = randomBytes(8).toString("hex");

const jwks = { keys: [jwk] };
const serialized = JSON.stringify(jwks);

console.error("Add this to .env.local:\n");
console.log(`ATPROTO_JWK_PRIVATE='${serialized}'`);

// Sanity-check by exporting the matching public JWK so the user knows
// what /jwks.json will publish.
const pubJwk = publicKey.export({ format: "jwk" });
pubJwk.kid = jwk.kid;
pubJwk.alg = "ES256";
console.error("\nPublic JWK (for reference):");
console.error(JSON.stringify(pubJwk, null, 2));
