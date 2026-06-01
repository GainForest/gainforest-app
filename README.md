# Bumiscan

Bumiscan is a block explorer for everything GainForest signs on the AT Protocol, in the
editorial design language of the [gainforest-app](../gainforest-app) landing
(cream + sage, Cormorant Garamond headlines, the brushed underline, the dark
ink data bands). It ports the GainForest-relevant slices of
[GainForest/hyperscan](https://github.com/GainForest/hyperscan) and folds in
the live status page and the Bumicerts donations dashboard.

```bash
pnpm install
pnpm dev        # http://127.0.0.1:3040
pnpm build
```

## Pages

Each surface is its own route (shared `TopNav` + `Footer` in the root layout):

| Route | Source | Data |
|---|---|---|
| `/` | `app/_lib/kpis.ts` (server) | hero KPI band + a six-card "Browse the commons" grid |
| `/observations` | `app/_lib/indexer.ts` `walkOccurrences()` (client) | `appGainforestDwcOccurrence` Darwin Core records, image/audio-forward with a media filter |
| `/sites` | `app/_lib/indexer.ts` `fetchSites()` (client) | `appGainforestOrganizationInfo` organizations with cover/logo + country |
| `/bumicerts` | `app/_lib/indexer.ts` `fetchBumicerts()` (client) | `orgHypercertsClaimActivity` impact claim activities |
| `/donations` | `app/_lib/dashboard.ts` (client) | `orgHypercertsFundingReceipt` from the facilitator repo, re-aggregated exactly like the bumicerts monorepo's `/dashboard` |
| `/devices` | `app/_lib/devices.ts` (server) + `/api/devices` | Tainá field-Pi liveness, ported from [pi-taina-monitor](https://github.com/GainForest/pi-taina-monitor): healthchecks.io heartbeats + embedded system/taina stats |
| `/status` | `app/_lib/status.ts` | instatus `summary.json` + `v2/components.json`, re-polled every 60s |

Each record opens a detail drawer (`RecordDrawer`) with its structured
fields, the canonical `at://` URI (copyable), and contextual links out to
Bumicerts / Green Globe / Bluesky.

### Tainá device monitor

`/devices` reads the field Raspberry Pi heartbeats from healthchecks.io using a
read-only API key in `HEALTHCHECKS_API_KEY` (server-side only; never shipped to
the browser). Without the key the page shows a "monitoring not configured"
state, so it is safe to deploy without the secret. To light it up:

```bash
vercel env add HEALTHCHECKS_API_KEY production   # paste the read-only key
vercel --prod
```

See `.env.local.example`. The board re-polls `/api/devices` every 60s (the Pi
heartbeat cadence) and leads with liveness: status, last-seen, CPU temp, RAM,
disk, load, uptime, and the local Tainá draft queue.

## Design system

Ported verbatim from gainforest-app: tokens in `app/globals.css`
(`--background` cream, `--primary` sage `#3e7053`, `--brand` mint `#2fce8a`
restricted to logo + live-data accents), the `LogoMark` CSS-mask, the
`BrushedText` cubic-curve underline, the Cormorant / Instrument Serif / Inter
fonts, and the favicon + icon set (`public/icons/`, copied from the landing).

## Why client-side fetching

Hyperindex (`hi.gainforest.app/graphql`) and `plc.directory` both serve
`access-control-allow-origin: *`, so the record grids page the indexer and
resolve PDS blob images straight from the browser. The server only prefetches
the cheap KPI `totalCount`s and the status snapshot (both cached via
`revalidate`), so the page shell paints instantly. The occurrence gallery
walks the indexer progressively because media-bearing records are sparse and
clustered in the newest pages (the same reason gainforest-app's SpecimenWall
walks) — cards stream in as they're found.

## Data endpoints

- Indexer: `https://hi.gainforest.app/graphql`
- Facilitator (all donations): `did:plc:edod7rboajioq3jbyxsgeicc`
- Status: `https://gainforest-status.instatus.com`
- Links out: `certs.gainforest.app`, `data.gainforest.app`

> The explorer is a read-only window over the commons. Donation figures
> mirror the live indexer and may lag the chain; it is not an official record.
