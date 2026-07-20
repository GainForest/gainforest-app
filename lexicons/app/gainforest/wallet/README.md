# Wallet lexicons (`app.gainforest.wallet.*`)

The donation-wallet records: Splits SmartVault (ERC-4337 passkey multisig)
wallets whose address is derived with CREATE2 from the account DID + founding
signer set + threshold, plus the pending multi-approval transfer record.

| NSID | Status | Purpose |
|---|---|---|
| `app.gainforest.wallet.primary` | 🟢 published | Canonical wallet record (fixed rkey `self`), personal and organization accounts alike. `signers` + `threshold` are the FOUNDING CREATE2 inputs (frozen once the address holds funds or is deployed); `addedSigners` is an append-only metadata directory for passkeys enrolled ON-CHAIN afterwards — the chain is the authority for the live signer set. |
| `app.gainforest.wallet.pendingSend` | 🟢 published | A transfer awaiting more passkey approvals (fixed rkey `self`, one at a time). Ephemeral: deleted when the transfer settles or is cancelled. |
| `app.gainforest.wallet.splitsVault` | 🟢 published (LEGACY) | Original collection name. Still read as a fallback; records migrate to `primary` on their next write. |

The human-readable copies rendered at `/docs/lexicons` live in
`app/docs/lexicons/_schemas/app/gainforest/wallet/` — keep both in sync.

## Publishing

Schemas are published as `com.atproto.lexicon.schema` records under the
GainForest lexicon authority account `gainforest.earth`
(`did:plc:qoti4acfmc5wg6zzmtix6hse`) — the same authority as every other
`app.gainforest.*` group. From the repo root:

```sh
goat lex publish \
  --username gainforest.earth --password "…" \
  lexicons/app/gainforest/wallet
```

`goat lex status` shows sync state. Last published: 2026-07-17 (rev 2:
added `primary.addedSigners`).

## DNS (Cloudflare)

NSID authority resolution for this group is live (added 2026-07-17, same
pattern as every sibling group — `funding`, `organization`, `feed`, `dwc`, …):

```
_lexicon.wallet.gainforest.app  TXT  "did=did:plc:qoti4acfmc5wg6zzmtix6hse"
```

Verified: `goat lex resolve app.gainforest.wallet.primary` resolves the
authority via DNS and fetches the schema, and `goat lex status` shows all
three wallet lexicons 🟢 with no DNS warnings.

## Indexing

Deliberately **not** indexed by hyperindex: the app reads wallet records
straight from the owner's PDS so the verification path (PDS record + one RPC
read recomputing the CREATE2 address) has no third dependency, and
`pendingSend` is ephemeral. If typed GraphQL queries are ever wanted for
`primary`, register the lexicon with the indexer (admin UI / lexicon dir) —
do not index `pendingSend`.
