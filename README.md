# GainForest

GainForest is a block explorer for everything GainForest signs on the AT Protocol, in the
editorial design language of the [gainforest-app](../gainforest-app) landing
(cream + sage, Cormorant Garamond headlines, the brushed underline, the dark
ink data bands). It ports the GainForest-relevant slices of
[GainForest/hyperscan](https://github.com/GainForest/hyperscan) and folds in
the live status page and the GainForest donations dashboard.

```bash
pnpm install
pnpm dev        # Next.js on http://127.0.0.1:3040
pnpm dev:proxy  # Caddy HTTPS proxy at https://local.gainforest.app
pnpm build
```

## Pages

Each surface is its own route (shared `TopNav` + `Footer` in the root layout):

| Route | Source | Data |
|---|---|---|
| `/` | `app/_lib/kpis.ts` (server) | hero KPI band + a six-card "Browse the commons" grid |
| `/observations` | `app/_lib/indexer.ts` `walkOccurrences()` (client) | `appGainforestDwcOccurrence` Darwin Core records, image/audio-forward with a media filter |
| `/sites` | `app/_lib/indexer.ts` `fetchSites()` (client) | `appCertifiedActorOrganization` organizations with profile image + country |
| `/certs` | `app/_lib/indexer.ts` `fetchBumicerts()` (client) | `orgHypercertsClaimActivity` impact claim activities |
| `/donations` | `app/_lib/dashboard.ts` (client) | `orgHypercertsFundingReceipt` from the facilitator repo, re-aggregated exactly like the bumicerts monorepo's `/dashboard` |
| `/devices` | `app/_lib/devices.ts` (server) + `/api/devices` | Tainá field-Pi liveness, ported from [pi-taina-monitor](https://github.com/GainForest/pi-taina-monitor): healthchecks.io heartbeats + embedded system/taina stats |
| `/status` | `app/_lib/status.ts` | instatus `summary.json` + `v2/components.json`, re-polled every 60s |

Each record opens a detail drawer (`RecordDrawer`) with its structured
fields, the canonical `at://` URI (copyable), and contextual links out to
GainForest / Green Globe / Bluesky.

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

## GainForest auth

The sidebar and header auth UI are wired to the central auth service configured
by `NEXT_PUBLIC_AUTH_BASE_URL`. The app forwards the incoming `Cookie` header
server-side to `/api/auth/session`, then redirects users to `/login` or
`/logout` with the current page as `returnTo`.

Auth cookies are scoped to `*.gainforest.app`, so local auth must run through a
`*.gainforest.app` hostname over HTTPS, just like GainForest. Use Caddy as the
local reverse proxy:

```bash
# one-time machine setup
brew install caddy
sudo sh -c 'echo "127.0.0.1 local.gainforest.app" >> /etc/hosts'

# terminal 1 — Next.js on :3040
pnpm dev

# terminal 2 — HTTPS proxy on :443 -> :3040
pnpm dev:proxy
```

Open **https://local.gainforest.app**. Set `NEXT_PUBLIC_AUTH_BASE_URL` locally
and in hosted environments; the app intentionally has no hardcoded fallback.

## Tainá — the Telegram field assistant

**Tainá** lets a signed-in user connect their own Telegram bot and turn nature
sightings (a photo or a note) into GainForest observations under their account.
The agent identifies the species (Claude Sonnet 5 vision), chats it through
(GLM 5.2), and publishes to the user's PDS. **This app is the front-end**; the
agent runs in a separate always-on service.

- **Sidebar → AI → Tainá** opens the setup page `/taina` — connect your
  [@BotFather](https://t.me/BotFather) bot token, activate it with a one-time
  code, and it shows as linked.
- **Profile → Tainá tab** (owner-only) is the live dashboard: bot status, the
  API key, a **Restart session** button, and the observation chat.

| Piece | Where |
|---|---|
| Setup page + connect flow | `app/taina/`, `app/taina/_components/TainaSetupClient.tsx` |
| Profile dashboard tab | `app/account/[did]/taina/`, `app/account/_components/TainaDashboardClient.tsx` |
| Proxy routes (session-gated) | `app/api/taina/{provision,dashboard,key,session}` |
| Server client + shared constant | `app/_lib/taina-agent.ts`, `app/_lib/taina-shared.ts` |
| Sidebar AI section | `app/_components/AppShell.tsx` |

**How it works.** Auth reuses this app's session (no separate Tainá login); the
DID always comes from the session, never the request body. The proxy talks to
the Flue runtime with a shared secret. Publishing uses a **real GainForest
agent key** (`gf_pat_…`, named “Tainá — Telegram bot” so Settings → AI agent
keys badges it) minted from the user's sign-in — the bot then follows the
canonical [`/skill.md`](https://www.gainforest.app/skill.md) guide, exactly like
any other connected AI agent. There is no bespoke upload endpoint. Telegram
photos land in the agent's `/inbox` sandbox folder for blob upload.

**Config** (see `.env.local.example`): `TAINA_FLUE_BASE_URL` and
`TAINA_PROVISION_SHARED_SECRET` (fall back to `FLUE_BASE_URL` /
`PROVISION_SHARED_SECRET`, then local dev defaults). **Both must be set on
Vercel** or production can't reach the runtime.

**Links:** agent repo [`GainForest/agent-village`](https://github.com/GainForest/agent-village)
· runtime `https://agent-village-flue-production.up.railway.app` · built on
[Flue](https://flueframework.com). The agent internals, data flows, and deploy
notes live in that repo's `AGENTS.md`.

## Design system

Ported verbatim from gainforest-app: tokens in `app/globals.css`
(`--background` cream, `--primary` sage `#3e7053`, `--brand` mint `#2fce8a`
restricted to logo + live-data accents), the `LogoMark` CSS-mask, the
`BrushedText` cubic-curve underline, the Cormorant / Instrument Serif / Inter
fonts, and the favicon + icon set (`public/icons/`, copied from the landing).

## Why client-side fetching

The configured Hyperindex endpoint (`NEXT_PUBLIC_INDEXER_URL`, defaulting to
`https://api.hi.gainforest.app/graphql`) and `plc.directory` both serve
`access-control-allow-origin: *`, so the record grids page the indexer and
resolve PDS blob images straight from the browser. The server only prefetches
the cheap KPI `totalCount`s and the status snapshot (both cached via
`revalidate`), so the page shell paints instantly. The occurrence gallery
walks the indexer progressively because media-bearing records are sparse and
clustered in the newest pages (the same reason gainforest-app's SpecimenWall
walks) — cards stream in as they're found.

## Data endpoints

- Indexer: `NEXT_PUBLIC_INDEXER_URL` or `https://api.hi.gainforest.app/graphql`
- Facilitator (all donations): `did:plc:edod7rboajioq3jbyxsgeicc`
- Status: `https://gainforest-status.instatus.com`
- Links out: `data.gainforest.app` (GainForest links stay in this app)

> The explorer is a read-only window over the commons. Donation figures
> mirror the live indexer and may lag the chain; it is not an official record.
