# GainForest landing

A Next.js 16 (App Router, Turbopack) landing page that unifies the two halves
of the GainForest stack:

- **the Globe** — the satellite-view project explorer at
  [data.gainforest.app](https://data.gainforest.app) (source: [GainForest/green_globe](https://github.com/GainForest/green_globe))
- **Bumicerts** — the verifiable-impact funding marketplace at
  [certs.gainforest.app](https://certs.gainforest.app) (source:
  [GainForest/bumicerts-monorepo](https://github.com/GainForest/bumicerts-monorepo))

The page renders live data from both apps — recent high-quality Bumicerts in
the hero card, real ATProto-sourced project pins on a draggable globe — so
visitors land on a snapshot of the network rather than a static brochure.

It also hosts a draggable pixel-art **Taina codex pet** in the bottom-left
corner, and a proper ATProto OAuth sign-in flow ported from
[simocracy-v2](https://github.com/your-org/simocracy-v2) so a visitor can
auth against their own PDS without ever touching the gainforest.app backend.

![Landing screenshot](screenshot.png)

## Quickstart

```bash
pnpm install
cp .env.example .env.local
node scripts/generate-jwk.mjs >> .env.local   # one-time, see "ATProto sign-in"
pnpm dev                                       # → http://127.0.0.1:3030
```

```bash
pnpm build && pnpm start                       # production build, also on 3030
```

> **Important:** for OAuth to work locally you must visit
> `http://127.0.0.1:3030`, **not** `http://localhost:3030`. ATProto's
> loopback `client_id` is encoded as `http://localhost/?…&redirect_uri=…`
> and the redirect_uri must resolve to the same origin the browser is on
> (which the SDK forces to `127.0.0.1` for loopback). `pnpm dev` binds to
> both, so just use the 127.0.0.1 URL.

The dev server uses Turbopack (`next dev --turbopack`). Type-checking is done
with `pnpm exec tsc --noEmit`; the repo has no separate lint config — the
Next compiler does all the static checking.

## Pages & components

```
app/
├── page.tsx                       async server component; fetches
│                                  Bumicerts snapshot + renders the page
├── layout.tsx                     fonts, metadata, mounts the
│                                  <FloatingTaina> on every route
├── globals.css                    design tokens (--background cream
│                                  #f4efe4, --primary forest #335a3c, …)
├── _components/                   (UI only — no business logic)
│   ├── TopNav.tsx                 async server component; reads getSession()
│   │                              and resolves the handle via plc.directory
│   ├── SignInPopover.tsx          client; ATProto handle/PDS form +
│   │                              signed-in indicator + logout
│   ├── Hero.tsx                   headline, copy, tall tropical sprig,
│   │                              Bumicerts card, live globe
│   ├── BumicertsCard.tsx          faux Bumicerts UI card with three live
│   │                              high-quality projects + "Live" badge
│   ├── GlobeCard.tsx              async; fetches pins, renders <LiveGlobe>
│   ├── LiveGlobe.tsx              client; react-globe.gl with dots,
│   │                              radar pings, auto-rotate
│   ├── ChoosePath.tsx             "Open the Globe / Explore Bumicerts"
│   │                              strip with a small <LiveGlobe>
│   ├── IWantTo.tsx                bottom "I want to…" cards + sprig
│   ├── HowItWorks.tsx             4-step strip with hand-drawn icons
│   ├── NatureCTA.tsx              "Nature thrives" CTA banner with a
│   │                              raster topographic decoration
│   ├── FloatingTaina.tsx          animated codex-pet (Taina sim)
│   │                              + streaming chat panel
│   ├── Footer.tsx                 logo + © + external links
│   └── Logo.tsx                   inline GainForest leaf SVG (mask-image)
├── _lib/
│   ├── bumicerts.ts               fetchLiveBumicerts() — hyperlabel ⨯ indexer
│   ├── projects.ts                fetchProjectPins() — green_globe API
│   ├── auth-config.ts             OAuth client_id / redirect_uri / scope
│   ├── auth-store.ts              in-memory state + session + cookie stores
│   ├── auth-client.ts             singleton NodeOAuthClient + JWK loading
│   ├── auth-session.ts            getSession() / getAgent() / getUserDid()
│   ├── codex-pet.ts               sprite-sheet animator (port of simocracy)
│   ├── openrouter.ts              minimal OpenRouter chat client
│   └── taina-sim.ts               fetches the Taina sim's PDS persona
├── api/
│   ├── oauth/login/route.ts       GET — start OAuth flow from a handle/PDS
│   ├── oauth/callback/route.ts    GET — finish OAuth, issue session cookie
│   ├── auth/logout/route.ts       POST — clear session
│   ├── auth/whoami/route.ts       GET — JSON status for client polling
│   └── sim-chat/route.ts          POST — stream Taina chat (OpenRouter)
├── client-metadata.json/route.ts  OAuth client metadata document
└── jwks.json/route.ts             public JWKs (private 'd' stripped)
```

## Live data flows

### 1. Bumicerts hero card → hyperlabel + GainForest indexer

Mirrors `fetchTierMatchedActivityNodes()` in
[bumicerts-monorepo](https://github.com/GainForest/bumicerts-monorepo)
(`apps/bumicerts/graphql/indexer/queries/activities/index.ts`):

1. `GET https://hyperlabel-production.up.railway.app/api/recent?tier=high-quality&limit=2000`
   — returns every claim activity tagged `high-quality` by GainForest's
   labeling scorer.
2. For each URI returned, query the indexer:
   ```graphql
   query LandingActivityByUri($uri: String!) {
     orgHypercertsClaimActivityByUri(uri: $uri) {
       did rkey title shortDescription image { … }
     }
   }
   ```
3. Resolve `image.ref` → public PDS blob URL via `plc.directory` →
   `com.atproto.sync.getBlob`.
4. Sort by `createdAt DESC`, take the first N.

Endpoint: `process.env.NEXT_PUBLIC_INDEXER_URL`
(default `https://dev.hi.gainforest.app/graphql`).
Revalidates every **15 minutes**.

### 2. Globe pins → ATProto via green_globe's list-organizations route

Literal port of
[useIndexedOrganizations](https://github.com/GainForest/green_globe/blob/main/src/app/(map-routes)/(main)/_hooks/useIndexedOrganizations.ts):

1. `GET https://data.gainforest.app/api/list-organizations?info=true&mapPoint=true`
   — green_globe walks Hyperindex → org `defaultSite` → certified-location
   GeoJSON blob on the PDS → centroid (Turf.js) → `{ did, info, mapPoint }`.
2. Client-side filter: keep only orgs with **both** `info` and `mapPoint`
   non-null (and a non-empty `info.name`).
3. The landing also queries Hyperindex `appGainforestOrganizationInfo` for
   each org's `coverImage` / `logo` blob and resolves that blob through the
   org's PDS, producing `ProjectPin.imageUrl` when a real image exists.

Endpoint: `process.env.NEXT_PUBLIC_GREEN_GLOBE_URL`
(default `https://data.gainforest.app`). Revalidates every **5 minutes**.

Currently surfaces ~52 pins. The S3 `gainforest-all-shapefiles.geojson`
file is **not** used — that path only feeds green_globe's separate
`(shapefile-related)` route.

### 3. Partners globe → live Green Globe / Hyperindex spotlight

The partners section (`app/_components/Partners.tsx` +
`PartnersClient.tsx`) uses `fetchProjectPins()` — the same Green Globe /
Hyperindex-backed source as the globe pins — to render a compact live globe.
A small overlay cycles through one real organization/community at a time,
showing its name, country code, and `ProjectPin.imageUrl` when Hyperindex has
a real cover/logo blob for that org. Do not replace this with static
categories, marketing archetypes, or generated partner imagery. If you change
the section, keep the spotlight and the globe on the same `ProjectPin[]`
dataset so the names, countries, images, and map remain consistent. The
adjacent community-calls CTA links to the GainForest YouTube videos page,
where monthly community calls and steward sessions are published.

### 4. Awards & press carousel → curated sources + Substack RSS

`app/_components/Media.tsx` renders a horizontal carousel of real awards,
press, talks, documentaries, festival works, and recent GainForest
Substack posts.

- Curated items are configured in `CURATED_ITEMS` with a slug, kind,
  ISO `sortDate`, source, real external URL, and local cover image from
  `public/decor/news/<slug>.jpg`.
- Curated item copy is localised in `app/_lib/i18n.ts` under
  `media.items.<slug>.headline` and `.summary` for all five locales
  (EN/ES/PT/SW/ID). Keep our summaries organization-level: say
  `GainForest`, `Taina`, `Bumicerts`, the community work, or the partner
  org instead of centering individual names.
- Blog posts come from `fetchSubstackPosts()` in `app/_lib/blog.ts`, which
  reads `https://gainforest.substack.com/feed`, keeps the source-language
  title/summary, and uses the RSS `<enclosure>` image when present.

#### Adding a news item

1. Research the source first: confirm URL, title, publisher, date, and
   thumbnail. Use `fetch_content` / web search for blocked pages, and
   `yt-dlp --dump-json` for YouTube metadata.
2. Add a short slug to the `CuratedSlug` union and a matching object in
   `CURATED_ITEMS`. Use an ISO `sortDate`; newest-first ordering is
   computed at runtime.
3. Add `media.items.<slug>.headline` and `.summary` to the `Messages`
   type and every locale block in `app/_lib/i18n.ts`.
4. Add a cover at `public/decor/news/<slug>.jpg`. Prefer real `og:image`,
   `twitter:image`, RSS enclosure, or YouTube maxres thumbnail. Normalize
   to 1600×900 JPEG:
   `magick input -strip -resize '1600x900^' -gravity center -extent 1600x900 -quality 85 public/decor/news/<slug>.jpg`.
5. Generate a cover only if the publisher blocks image access, has no
   usable image, or the real image clashes with the editorial system.
   Prompt for a 16:9 premium editorial image in the GainForest cream/sage
   palette, with no text, logos, watermarks, UI chrome, or identifiable
   faces.
6. Verify with `pnpm exec tsc --noEmit`, `pnpm build`, and a quick mobile +
   desktop carousel check in the browser.

### Graceful degradation

Both `_lib` modules wrap the upstream call in `try/catch` and return a
small curated fallback (`FALLBACK_PINS` / `FALLBACK_SNAPSHOT`) if the
upstream is down. Page builds and renders are never blocked by network
failure.

## ATProto sign-in

Port of the OAuth setup in
[`simocracy-v2/lib/atproto-*`](https://github.com/your-org/simocracy-v2),
slimmed down to what a landing page needs.

### One-time setup

```bash
node scripts/generate-jwk.mjs >> .env.local
```

This appends an `ATPROTO_JWK_PRIVATE='{"keys":[…]}'` line to `.env.local`.
The private key signs the client-assertion JWTs the OAuth flow uses;
the public half is published at `/jwks.json` so the upstream authorisation
server can verify the signatures.

You should also have:

```env
NEXT_PUBLIC_BASE_URL=http://127.0.0.1:3030   # dev
# or NEXT_PUBLIC_BASE_URL=https://your-domain.com for production
```

In loopback dev mode the `client_id` is the special encoded form
`http://localhost/?scope=…&redirect_uri=…` (ATProto loopback spec) so
no client metadata fetch is needed. In production the SDK fetches
`/client-metadata.json` instead — and you must use HTTPS.

### Flow

```
[ Sign in popover ]                 ← app/_components/SignInPopover.tsx
       │  user enters handle / PDS
       ▼
GET /api/oauth/login?handle=…       ← app/api/oauth/login/route.ts
       │  client.authorize(handle)  (NodeOAuthClient + PAR)
       ▼
303 → upstream PDS                  ← user logs in there
       │
       ▼
GET /api/oauth/callback?code=…      ← app/api/oauth/callback/route.ts
       │  client.callback() → session
       │  cookieSessionStore.set(token → did)
       │  Set-Cookie: gf-session-token=…
       ▼
303 → /                             ← TopNav reads getSession() server-side
                                       and renders the signed-in chip
```

`getSession()` (in `app/_lib/auth-session.ts`) is `cache()`-wrapped so
every server component on a single request shares one session restore.

### State + session storage

`app/_lib/auth-store.ts` uses **in-memory maps** on `globalThis`. This:

- ✅ works for a single Next.js process (dev + most prod deploys)
- ✅ survives HMR via `globalThis.__gfAuthStores`
- ❌ does **not** work for multi-worker serverless (Vercel functions, etc.)

If you ever fan out across workers, copy `lib/redis-state-store.ts` from
simocracy-v2 — it supports both Upstash REST (Vercel) and TCP Redis
(local) and is a drop-in replacement for the three exported stores.

The session cookie is `gf-session-token`, opaque, 32 random base64url
bytes, `HttpOnly` + `SameSite=Lax`, 7-day max-age. The token resolves
to a DID via the in-memory `cookieSessionStore`; the cookie itself
never carries the DID directly.

### Routes summary

| Route | Method | Purpose |
|---|---|---|
| `/api/oauth/login` | GET | Start OAuth from `?handle=` or `?identifier=` |
| `/api/oauth/callback` | GET | Finish OAuth, set cookie |
| `/api/auth/logout` | POST (GET alias) | Clear session |
| `/api/auth/whoami` | GET | `{ signedIn, did }` for client polling |
| `/client-metadata.json` | GET | OAuth client metadata (production `client_id`) |
| `/jwks.json` | GET | Public keys for client-assertion verification |

## Floating Taina (a real Simocracy sim)

`app/_components/FloatingTaina.tsx` is a fully-animated **codex pet**
that lives in the bottom-left of every route on desktop (bottom-right
on mobile). It is a port of simocracy's
[`FloatingEinstein`](https://github.com/your-org/simocracy-v2/blob/main/components/feedback/floating-einstein.tsx)
pointed at a specific Simocracy sim:

- **Sim**: [`Taina`](https://www.simocracy.org/sims/taina)
  (`at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m`)
- **Owner**: `@daviddao.org` — Taina is GainForest's actual
  community-facing AI assistant, born during the XPRIZE Rainforest from
  co-design with Indigenous communities around Greater Manaus. Her
  constitution centres data sovereignty, storytelling, and IPLCs
  (Indigenous Peoples & Local Communities). She replaces the earlier
  `Capybara` sim that this widget used to be bound to (per team
  feedback: "I liked the floating companion but didn't like that it
  was a capybara — use Taina instead").

### Sprite

The sim's PDS blobs are mirrored locally so the floating widget doesn't
pay a cross-origin fetch on every page load:

- `public/codex-pets/taina-poster.png` — idle PNG (~20 KB)
- `public/codex-pets/taina-sheet.webp` — full 1536×1872 codex-pet sheet
  (8 columns × 9 rows of 192×208 cells, ~1.9 MB WebP)

The sheet follows the
[OpenAI hatch-pet skill](https://github.com/openai/skills/tree/main/skills/.curated/hatch-pet)
layout, so `app/_lib/codex-pet.ts` (port of `simocracy-v2/lib/sprites/codex-pet.ts`)
decodes the cells into a `requestAnimationFrame` loop with hand-tuned
per-frame durations.

To re-download the assets after the owner edits the sim:

```bash
DID=did:plc:qc42fmqqlsmdq7jiypiiigww
PDS=https://blewit.us-west.host.bsky.network
IMAGE_CID=bafkreiakyoccwvhvyw7ewbptajxm4vlnyirjz5rf4gdgfx57zendg3xupm
SHEET_CID=bafkreiciempzqueekmdpqhcfodis77ozdvsmjlkzi6uolwgazlnjfh7due
curl -L "$PDS/xrpc/com.atproto.sync.getBlob?did=$DID&cid=$IMAGE_CID" \
  -o public/codex-pets/taina-poster.png
curl -L "$PDS/xrpc/com.atproto.sync.getBlob?did=$DID&cid=$SHEET_CID" \
  -o public/codex-pets/taina-sheet.webp
```

(The CIDs above are pinned to the current Taina record. If the owner
edits the blobs they'll change; re-fetch them from
`com.atproto.repo.getRecord?repo=$DID&collection=org.simocracy.sim&rkey=3ml7iunv6pp2m`
under `value.image.ref.$link` / `value.petSheet.ref.$link`.)

### Behaviour

- Sits 32 px from the bottom-LEFT on desktop / 18 px from the
  bottom-RIGHT on mobile by default; drag anywhere; position persists
  in `localStorage` under `gainforest.floatingTaina.position.v1`.
- 4 px drag threshold separates click from drag.
- **Animation state machine** — mirrors simocracy's:
  - `dragging` → `running-left` / `running-right` (based on pointer step)
  - `streaming` a reply → `review` (heads-down)
  - panel just opened → `waving` (~1.6 s)
  - otherwise → `idle`
- Click opens a chat panel anchored to whichever side of the sprite has
  more room; Escape closes.
- Hidden inside iframes.

### Chat

The chat panel streams replies from `/api/sim-chat` (see
`app/api/sim-chat/route.ts`). The system prompt is built fresh per request
by `getTainaPersona()` in `app/_lib/taina-sim.ts`, which:

1. Resolves the sim owner's DID → PDS via `plc.directory` (1 h cache).
2. Lists their `org.simocracy.agents` + `org.simocracy.style` records.
3. Filters to records whose `sim.uri` matches the Taina sim.
4. Pulls `shortDescription`, `description`, and `style` into the prompt.

Result: the companion always speaks in the latest version of the
Taina persona. If the owner edits the sim on simocracy.org, the next
request (or after the ISR window) picks up the new constitution
automatically — no rebuild needed.

Chat itself goes through OpenRouter (default model
`google/gemini-2.5-flash`). Set `OPENROUTER_API_KEY` in `.env.local`; if
it's missing the route returns a friendly 503 and the panel shows a
nudge.

## Visual decoration

All raster decoration is **generated via gpt-image-2** rather than
hand-coded SVG. The pipeline (Codex CLI + chroma-key removal) lives in
`/Users/david/.codex/skills/.system/imagegen/`. See the
[codex-imagegen skill](https://github.com/your-org/pi-skills/tree/main/codex-imagegen)
for the prompt patterns we use. Quick recipe:

1. Prompt gpt-image-2 with an explicit `#ff00ff` chroma-key background
   so the subject is cleanly separable.
2. Run `remove_chroma_key.py --soft-matte --despill --auto-key border`
   to convert the magenta to alpha.
3. Trim + drop into `public/decor/` or `public/codex-pets/`.

Current generated assets:

| File | Purpose |
|---|---|
| `public/decor/leaves.png` | Tall tropical hero plant — monstera + fern + palm + philodendron + heliconia |
| `public/decor/sprig-side.png` | Sparser tropical sprig that decorates the right of the "I want to…" cards |
| `public/decor/icon-want-{discover,browse,create,learn}.png` | Card icons (globe, plant, certificate, open book) |
| `public/decor/icon-step-{discover,understand,support,grow}.png` | "How it works" step icons |
| `public/decor/icon-{globe,plant,leaf}.png` | Earlier-set ring-bordered icons (still used by `ChoosePath`) |
| `public/decor/topo-decor.png` | Hand-drawn contour lines decorating the "Nature thrives" CTA banner |
| `public/codex-pets/taina-poster.png` | The floating Taina codex pet (idle poster) |
| `public/codex-pets/taina-sheet.webp` | The Taina codex-pet sprite sheet (1536×1872) |

If you add a new decorative asset, prefer regenerating via gpt-image-2
over hand-coded SVG — the inline SVG topo lines we shipped first looked
mechanical next to the rest of the hand-drawn elements.

## Globe (`<LiveGlobe>`)

Built on [react-globe.gl](https://github.com/vasturiano/react-globe.gl)
(three.js wrapper) — chosen over Mapbox for three reasons:

1. No token required — works for any visitor / preview deployment.
2. The canvas is transparent, so the spherical earth floats on the cream
   page instead of sitting inside a dark rectangular card.
3. Dynamic-imported (`{ ssr: false }`) so its ~250 KB only loads in the
   browser.

The globe reproduces green_globe's `spinGlobe()` behaviour:

- `autoRotate = true`, `autoRotateSpeed = 0.55` (~3°/sec).
- Stops on the OrbitControls `start` event (user drag).
- All zoom paths disabled — `enableZoom = false`, `enablePan = false`,
  `min/maxDistance` pinned to the current distance, and wheel events are
  stopped from reaching the canvas so the page scrolls normally over it.

### Dots & pings

- **Dots**: `pointRadius = 1.1°` of arc, `#bff0ce`. ~52 pins total.
- **Pings** (radar rings):
  - Sparse subset (~14 of 52) — one ring per pin, staggered.
  - `ringMaxRadius = 12°`, `ringPropagationSpeed = 2.4`.
  - Pseudo-random `repeatPeriod` between 4–9 s per pin so they don't
    pulse in unison.
  - Colour decays as `pow(1-t, 1.6)` from `rgba(140,220,165,0.95)` to 0.

## Environment

`.env.local` (not committed):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | OAuth | – | Origin used for `client_id` and `redirect_uri`. Set to `http://127.0.0.1:3030` for dev, `https://your-domain.com` for prod. |
| `ATPROTO_JWK_PRIVATE` | OAuth | – | JWKS used to sign client-assertion JWTs. Generated by `node scripts/generate-jwk.mjs`. |
| `NEXT_PUBLIC_INDEXER_URL` | no | `https://dev.hi.gainforest.app/graphql` | GainForest indexer GraphQL endpoint |
| `NEXT_PUBLIC_HYPERLABEL_URL` | no | `https://hyperlabel-production.up.railway.app` | Hyperlabel quality scorer |
| `NEXT_PUBLIC_BUMICERTS_URL` | no | `https://certs.gainforest.app` | Where "Explore Bumicerts" / row links go |
| `NEXT_PUBLIC_GREEN_GLOBE_URL` | no | `https://data.gainforest.app` | Where to fetch project pins from |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | no | – | Legacy; only needed if you swap `<LiveGlobe>` back to a Mapbox renderer |

See `.env.example` for the canonical form (it has every variable in
required-then-optional order with sensible local defaults).

## Design language

- **Background**: warm cream `#f4efe4` (sampled from the original mockup).
- **Primary**: deep forest green `#335a3c`. Hover/dark `#2a4a31`.
- **Body**: Inter.
- **Display & UI accents**: Cormorant Garamond (the `Open tools for /
  regenerative intelligence` headline, with Cormorant's italic on the
  emphasis line) and Instrument Serif italic for in-line emphasis.
- **Borders**: `#d9d3c3` (regular), `#e6dfd0` (soft).

All colour and font tokens live in `app/globals.css` and are exposed both
as CSS custom properties and as Tailwind v4 `@theme inline` values.

## Tech stack

- **Framework**: Next.js 16 (App Router) + Turbopack
- **React**: 19
- **TypeScript**: strict mode
- **Styling**: Tailwind v4 (`@tailwindcss/postcss`) with CSS custom
  properties for design tokens
- **Fonts**: `next/font/google` (Cormorant Garamond, Instrument Serif,
  Inter) — self-hosted at build time
- **Globe**: `react-globe.gl` 2.38 + `three` 0.184 (dynamic-imported,
  client-only)
- **ATProto**: `@atproto/oauth-client-node`, `@atproto/oauth-types`,
  `@atproto/api`, `@atproto/jwk-jose`, `@atproto/jwk`

## Related repos

- [GainForest/green_globe](https://github.com/GainForest/green_globe) —
  Mapbox + three.js globe, ATProto data via Hyperindex.
- [GainForest/bumicerts-monorepo](https://github.com/GainForest/bumicerts-monorepo)
  — Bumicerts apps + shared ATProto packages.
- [simocracy-v2](https://github.com/your-org/simocracy-v2) — the
  upstream of both our OAuth and our FloatingTaina port.

## License

LGPL-3.0 (matching the upstream GainForest repos).
