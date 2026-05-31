# GainForest Explorer

A block explorer for everything GainForest signs on the AT Protocol, in the
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

## What it shows

| Section | Source | Data |
|---|---|---|
| **Hero KPIs** | `app/_lib/kpis.ts` (server) | `totalCount` for occurrences / activities / orgs / locations + raised total from funding receipts |
| **Explore → Species observations** | `app/_lib/indexer.ts` `walkOccurrences()` (client) | `appGainforestDwcOccurrence` Darwin Core records, image/audio-forward with a media filter |
| **Explore → Project sites** | `app/_lib/indexer.ts` `fetchSites()` (client) | `appGainforestOrganizationInfo` organizations with cover/logo + country |
| **Explore → Bumicerts** | `app/_lib/indexer.ts` `fetchBumicerts()` (client) | `orgHypercertsClaimActivity` impact claim activities |
| **Donations dashboard** | `app/_lib/dashboard.ts` (client) | `orgHypercertsFundingReceipt` from the facilitator repo, re-aggregated exactly like the bumicerts monorepo's `/dashboard` |
| **System status** | `app/_lib/status.ts` | instatus `summary.json` + `v2/components.json`, re-polled every 60s |

Every record opens a detail drawer (`RecordDrawer`) with its structured
fields, the canonical `at://` URI (copyable), and contextual links out to
Bumicerts / Green Globe / Bluesky.

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
