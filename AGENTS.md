# Agent Instructions

## Plain-language product copy

This app must stay understandable to non-technical users. Be strict: do not add user-facing jargon anywhere in pages, components, metadata, alt text, labels, buttons, toasts, modals, empty states, validation errors, or API error messages that can reach the UI.

### Banned user-facing terms

Do not show terms like:

- `did:plc`, `DID`, `rkey`, `URI`, `CID`, `repo`, `record`, `schema`, `collection`
- `AT Protocol`, `ATProto`, `atproto`, `PDS`, `indexer`, `Hyperindex`, `GraphQL`, `API`, `endpoint`, `JSON`
- `wallet address`, `transaction hash`, `Tx Hash`, `signature`, `authorization`, `facilitator`, `attestation`, `on-chain`, `blockchain`, `crypto`, `Base`, `USDC`
- `Darwin Core`, `GBIF`, `GeoJSON`, `Shapefile`, `CSV`, `TSV`, `Kobo`, `dataset`, `column mapping`
- `infrastructure`, `operational`, `uptime`, `incident`, `dashboard`, `analytics`

Internal code may still use protocol names, types, route params, comments, and constants when needed, but user-facing copy must translate them.

### Preferred plain-language replacements

Use replacements like:

- `profile`, `public profile`, `organization profile`
- `Bumicert`, `impact story`, `project story`, `checked certificate`
- `project place`, `project area`, `drawn map area`, `map location`
- `nature sighting`, `tree information`, `field sound recording`
- `payment app`, `digital dollars`, `payment details`, `completed gift`, `public donation note`
- `site health`, `services running`, `working`, `slow`, `not working`
- `file`, `spreadsheet export`, `file heading`, `tree group`, `photo folder`

### Before finishing changes

Run a user-facing copy scan for banned words in `app/` and `components/` and manually inspect matches. Many matches will be internal code; every visible string should be plain language.

Also run:

```bash
pnpm build
```
