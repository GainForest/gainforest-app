# Wallet lexicons (`app.gainforest.wallet.*`)

The donation-wallet records: Splits SmartVault (ERC-4337 passkey multisig)
wallets whose address is derived with CREATE2 from the account DID + founding
signer set + threshold, plus the pending multi-approval transfer record.

| NSID | Status | Purpose |
|---|---|---|
| `app.gainforest.wallet.primary` | 🟢 published | Canonical wallet record (fixed rkey `self`), personal and organization accounts alike. |
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

`goat lex status` shows sync state. Last published: 2026-07-17.

## DNS (Cloudflare) — still to add

NSID authority resolution for this group needs a TXT record that does not
exist yet (`gainforest.app` DNS is on Cloudflare; every sibling group —
`funding`, `organization`, `feed`, `dwc`, … — already has one):

```
_lexicon.wallet.gainforest.app  TXT  "did=did:plc:qoti4acfmc5wg6zzmtix6hse"
```

Until it exists, the schema records above are live but `goat lex resolve
app.gainforest.wallet.primary` (and other network resolvers) cannot discover
the authority, and `goat lex publish` needs `--skip-dns-check`.

## Indexing

Deliberately **not** indexed by hyperindex: the app reads wallet records
straight from the owner's PDS so the verification path (PDS record + one RPC
read recomputing the CREATE2 address) has no third dependency, and
`pendingSend` is ephemeral. If typed GraphQL queries are ever wanted for
`primary`, register the lexicon with the indexer (admin UI / lexicon dir) —
do not index `pendingSend`.
