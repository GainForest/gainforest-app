# AGENTS.md

Instructions for AI agents (Claude Code, etc.) working in this repository.
This is the landing page that fronts the two GainForest production apps —
[green_globe](https://github.com/GainForest/green_globe) and
[bumicerts-monorepo](https://github.com/GainForest/bumicerts-monorepo) —
and renders live data from both. It also hosts a draggable pixel-art
**capybara codex pet** and an ATProto OAuth sign-in flow ported from
simocracy-v2.

## Read first

Before touching anything visual or data-related, skim the upstream
documents — they encode rules that this landing inherits:

- `green_globe/AGENTS.md` — TypeScript strictness, Zustand patterns,
  shadcn/ui rules, Mapbox config, the `useIndexedOrganizations` filter
  pattern.
- `bumicerts-monorepo/apps/bumicerts/agents/DESIGN.md` — editorial
  minimalism, restrained motion, "no random gradient blobs", Lucide icons.
- `bumicerts-monorepo/apps/bumicerts/agents/DATA.md` — validate at the
  boundary; never trust raw upstream JSON shapes deep inside the app.
- `simocracy-v2/lib/atproto-*.ts` and `app/api/oauth/*` — the source we
  ported the auth machinery from. If a flow detail is unclear, check
  there first — our copy is structurally identical, just slimmer.
- `simocracy-v2/components/feedback/floating-einstein.tsx` — pattern for
  draggable codex-pet widgets; our `FloatingCapybara` follows the same
  drag/click loop.

When upstream rules conflict with anything written here, **this file
wins** for the landing — but call out the divergence in the PR.

## Hard rules

1. **No fake data on the landing page.** Every project, count, tag, and
   thumbnail you see must come from a real upstream source (hyperlabel,
   the indexer, green_globe's API) — never inline mock arrays in
   components.
2. **Fallbacks live in `app/_lib/*` only.** Both libs export a
   `FALLBACK_*` constant used inside a `try/catch`. UI components must
   not have their own "if loading show this list" arrays — they consume
   the snapshot the lib returned.
3. **Filters match green_globe exactly.** When you change pin selection,
   port the literal filter from green_globe's
   `useIndexedOrganizations` / Mapbox source code and link to the file in
   a comment. The S3 `gainforest-all-shapefiles.geojson` is *not* the
   source of pins (green_globe only uses it in its `(shapefile-related)`
   route); the source is ATProto via Hyperindex.
4. **TypeScript is strict.** `pnpm exec tsc --noEmit` must be clean
   before declaring work done. `any` requires a comment justifying it
   (one already exists for `globeRef` in `LiveGlobe.tsx` — three.js's
   ref shape is too dynamic to type without pulling in the world).
5. **Server-by-default.** The page is rendered server-side; only
   `<LiveGlobe>`, `<SignInPopover>`, `<FloatingCapybara>` and other
   components that need browser APIs are `"use client"`. Don't move
   data-fetching to the client unless there's a reason — server fetches
   share Next's `revalidate` cache and stay out of the bundle.
6. **Decoration is raster, not SVG.** Botanical sprigs, topographic
   contours, and icon sets are all generated via gpt-image-2 (see
   "Visual decoration" below). The one earlier inline SVG topographic
   decoration looked mechanical and was replaced — don't reintroduce
   hand-coded ovals or contour blobs.
7. **OAuth secrets stay in env.** `ATPROTO_JWK_PRIVATE` is the only
   secret the app needs and is generated via `scripts/generate-jwk.mjs`.
   Never log it, never print it, never commit it.

## Where things live

```
app/
├── page.tsx                       async server component; the entry point
├── layout.tsx                     fonts + metadata + mounts <FloatingCapybara>
├── globals.css                    design tokens (cream + forest green)
├── _components/                   only UI; no business logic
├── _lib/                          fetchers + auth + chat helpers
│   ├── bumicerts.ts               hyperlabel + indexer → LiveBumicert[]
│   ├── projects.ts                green_globe API → ProjectPin[]
│   ├── auth-config.ts             OAuth client_id / redirect_uri / scope
│   ├── auth-store.ts              in-memory state + session + cookie stores
│   ├── auth-client.ts             singleton NodeOAuthClient + JWK loading
│   ├── auth-session.ts            getSession()/getAgent()/getUserDid()
│   ├── codex-pet.ts               sprite-sheet animator (port of simocracy)
│   ├── openrouter.ts              minimal OpenRouter chat client
│   └── capybara-sim.ts            Capybara sim metadata + PDS persona loader
├── api/
│   ├── oauth/login/route.ts       GET — start OAuth from ?handle=
│   ├── oauth/callback/route.ts    GET — finish OAuth, issue session cookie
│   ├── auth/logout/route.ts       POST (GET alias) — clear session
│   ├── auth/whoami/route.ts       GET — JSON status
│   └── sim-chat/route.ts          POST — stream Capybara chat (OpenRouter)
├── client-metadata.json/route.ts  OAuth client metadata document
└── jwks.json/route.ts             public JWKs

public/decor/                      generated raster decorations
public/codex-pets/                 capybara sim sprites (mirrored from PDS)
scripts/generate-jwk.mjs           one-shot JWK generator (port of simocracy)
```

The `_` prefix on `_components/` and `_lib/` keeps them out of Next's
route-segment scanner — they are private to the app directory.

## Live data flows (don't lose these)

### Bumicerts hero card

```
hyperlabel.recent({tier:'high-quality'}) ──► [URIs]
       │
       ▼
indexer.orgHypercertsClaimActivityByUri(uri) ──► node
       │
       ▼
plc.directory(did) + com.atproto.sync.getBlob ──► resolved image URL
       │
       ▼
LiveBumicert { id, did, rkey, title, shortDescription, imageUrl, href, createdAt }
```

The hyperlabel call returns the title for free, so we can use it as a
fallback if `node.title` is null. The image is always blob-ref → PDS-resolved.

This pipeline is a port of `fetchTierMatchedActivityNodes()` in
`apps/bumicerts/graphql/indexer/queries/activities/index.ts` — re-read
that function before changing the fetcher.

### Globe pins

```
green_globe.api/list-organizations?info=true&mapPoint=true
       │  (green_globe itself walks Hyperindex → defaultSite →
       │   certified location → GeoJSON blob → centroid)
       ▼
filter(o => o.info !== null && o.mapPoint !== null)
       │
       ▼
ProjectPin { did, name, country, lat, lon }
```

Literal port of
`green_globe/src/app/(map-routes)/(main)/_hooks/useIndexedOrganizations.ts`.
**Do not switch to the S3 GeoJSON file** — it's a curated subset used by a
different green_globe route and will silently drop real ATProto orgs.

### ATProto OAuth (port of simocracy-v2)

```
SignInPopover (client) ──► GET /api/oauth/login?handle=alice.bsky.social
                                                   │
                                                   ▼
                                       client.authorize(handle, {scope})
                                                   │  PAR happens inside
                                                   ▼
                                       303 → upstream PDS authorize endpoint
                                                   │  user consents
                                                   ▼
                                       GET /api/oauth/callback?code&state
                                                   │  client.callback()
                                                   ▼
                                       session.did → cookieSessionStore
                                                   │  randomBytes(32) token
                                                   ▼
                                       Set-Cookie: gf-session-token=…
                                                   │
                                                   ▼
                                       303 → /
```

`TopNav` (server) reads `getSession()` on every request, falls back to
the PLC directory to resolve handle, and passes both into the popover.

## OAuth machinery — rules

1. **`getSession()` is the single source of truth** in server code. Use
   it from server components; do not roll your own cookie parser.
2. **State store is in-memory.** `app/_lib/auth-store.ts` keeps three
   maps on `globalThis` so HMR doesn't wipe in-flight OAuth state. This
   is fine for single-process deployments. If you ever scale out, port
   `lib/redis-state-store.ts` from simocracy-v2 — it has both Upstash
   REST and TCP Redis adapters.
3. **Loopback vs production `client_id`** is decided by `auth-config.ts`
   based on whether `NEXT_PUBLIC_BASE_URL` is a loopback origin. Don't
   bypass that — both modes are tested.
4. **Cookie is `gf-session-token`**, opaque, never carries the DID
   directly. The token resolves to a DID via `cookieSessionStore.get()`.
5. **JWK generation** is one-time via `scripts/generate-jwk.mjs`. It
   appends to `.env.local` and prints the matching public JWK for
   reference. Don't regenerate in production unless you also redeploy
   `/jwks.json` simultaneously — the upstream may cache the old key.

## Globe component

`app/_components/LiveGlobe.tsx` is the single source of globe behaviour.

- Library: [react-globe.gl](https://github.com/vasturiano/react-globe.gl).
  Picked over Mapbox so the canvas is transparent and no API token is
  required.
- Loaded via `next/dynamic` with `ssr: false` — three.js touches `window`
  during init and the bundle is large.
- Controls config (auto-rotate, zoom-disabled, etc.) is applied in the
  `onGlobeReady` callback, **not** in a `setTimeout`-based effect.

| What | Where |
|---|---|
| Sphere image / bump | `globeImageUrl` / `bumpImageUrl` (unpkg paths) |
| Atmosphere | `showAtmosphere`, `atmosphereColor`, `atmosphereAltitude` |
| Dot size / colour | `pointRadius`, `pointColor` (in degrees of arc) |
| Ping animation | `ringMaxRadius`, `ringPropagationSpeed`, `ringColor` |
| Rotation speed | `AUTO_ROTATE_SPEED` constant |
| Zoom behaviour | `controls.enableZoom = false` + wheel `stopPropagation` |

Pings are rendered as a sparse subset of the dot set (`MAX_PINGING_PINS`)
with staggered random `repeatPeriod` so they never pulse in unison.

## FloatingCapybara (the Capybara sim)

`app/_components/FloatingCapybara.tsx` mounts on every route via
`app/layout.tsx`. It is a port of
`simocracy-v2/components/feedback/floating-einstein.tsx`, pointed at a
real Simocracy sim instead of the bundled Einstein:

- Sim AT-URI:
  `at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml6hwvjijm2q`
- Name: `Capybara` — owned by `@daviddao.org`.

### Assets

The sim's codex-pet sheet and idle PNG are mirrored under
`public/codex-pets/`:

- `capybara-poster.png` (128×128, 26 KB) — static poster, covers the
  canvas load gap until the first sprite frame paints.
- `capybara-sheet.webp` (1536×1872, 1.7 MB) — full 8×9 codex-pet sheet
  (idle / running-{left,right} / waving / jumping / failed / waiting /
  running / review).

If the owner edits the sim's blobs on simocracy.org, refresh both files
from the owner's PDS (`com.atproto.sync.getBlob?did=&cid=`). The CIDs
are in the sim record (`com.atproto.repo.getRecord?repo=&collection=org.simocracy.sim&rkey=`)
under `value.image.ref.$link` and `value.petSheet.ref.$link`.

### Behaviour

- Sits 32 px from the bottom-right on first mount; drag anywhere;
  position persists in `localStorage` under
  `gainforest.floatingCapybara.position`.
- 4 px drag threshold separates click from drag (matches simocracy).
- **Animation state machine** — driven by `renderPetAnimated` in
  `app/_lib/codex-pet.ts`:
  - `dragging` → `running-left` / `running-right` based on pointer step
    sign
  - `streaming` (chat reply in flight) → `review`
  - panel just opened → `waving` for `OPEN_WAVE_MS` (1.6 s), then
    `idle`
  - otherwise → `idle`
- Click toggles a 340×460 chat panel. The panel anchors above-and-left
  of the sprite by default and flips axes when there's no room.
- Escape closes the panel.
- Hidden inside iframes (no OG/print rendering).

### Chat (the FloatingEinstein analogue)

The chat panel streams replies from `/api/sim-chat` (port of
`simocracy-v2/app/api/feedback-chat/route.ts` minus auth and the
user-companion picker). Per request:

1. `getCapybaraPersona()` (in `app/_lib/capybara-sim.ts`) resolves the
   sim owner's DID → PDS via `plc.directory`, lists their
   `org.simocracy.agents` and `org.simocracy.style` records, and joins
   on `value.sim.uri` to pull the sim's `shortDescription`,
   `description`, and `style`. Both reads use `next: { revalidate: ... }`
   so the persona is cached at the HTTP layer.
2. `buildSystemPrompt()` composes those into the same shape as
   simocracy's `buildCompanionSystemPrompt` — identity, constitution,
   speaking style, job framing (welcome visitors / collect feedback),
   hard rules, and a recency-biased restatement of the speaking style.
3. `openRouterChat()` streams the reply from OpenRouter
   (default model: `google/gemini-2.5-flash`).

Client-side, the panel parses the SSE `data: {choices:[{delta:{content}}]}`
frames the same way FloatingEinstein does and updates the last assistant
message incrementally.

If `OPENROUTER_API_KEY` is missing the route returns a 503 and the panel
shows a friendly nudge. A naive per-IP rate limit (30/min, in-memory) is
baked into the route as the landing's only anti-abuse barrier — swap for
Redis if you ever deploy to multi-worker serverless.

### Rules

- **Don't bypass `capybara-sim.ts`.** The sim's persona is loaded from
  the owner's PDS at request time so the floating companion always speaks
  in the latest version. Hard-coding the constitution into the system
  prompt would stale-pin it.
- **Don't break the codex-pet contract.** The sheet must be 1536×1872
  with 8×9 cells of 192×208 and rows matching
  `CODEX_PET_ROWS` in `app/_lib/codex-pet.ts`. If you replace the sheet,
  validate dimensions and the per-row frame counts first.
- **Don't add auth to `/api/sim-chat`.** Unlike simocracy's chat (which
  is signed-in-only because every turn becomes an `org.simocracy.history`
  record), the landing companion is for anonymous visitors. Anti-abuse
  is the per-IP rate limit, not auth.
- **Don't ship the sim sheet as a URL.** The PDS blob URL works but adds
  cross-origin latency on every page load. Mirror to `public/codex-pets/`.

## Visual decoration

All raster decoration is generated via gpt-image-2 (Codex CLI image_gen
feature). The pipeline:

1. Prompt with an explicit `#ff00ff` chroma-key background. The model is
   reliable about respecting a flat solid background colour.
2. Run `remove_chroma_key.py --soft-matte --despill --auto-key border
   --transparent-threshold 12 --opaque-threshold 220` to convert magenta
   → alpha.
3. `magick … -trim +repage` and drop into `public/decor/` (or
   `public/codex-pets/` for pet sprites).

See `~/.codex/skills/.system/imagegen/SKILL.md` for the full skill
behaviour. Prompt-engineering rules we've learned the hard way:

- **For botanical sprigs**, describe pose explicitly: "tall narrow
  vertical specimen, branches arc outward but stay within 30% of canvas
  width from the central spine". gpt-image-2 happily produces wide
  horizontal sprawls if you don't constrain.
- **For tropical species**, name them: monstera (split leaves), fern
  fronds, palm fronds, philodendron heart leaves, heliconia bracts.
  Otherwise you get generic eucalyptus / olive shoots.
- **For icons**, specify "no outer ring/circle around the icon" and
  enforce uniform stroke weight. Also describe the silhouette (3-leaf
  sprout, certificate plaque + ribbon tails, etc.) — the model otherwise
  defaults to stock-icon variants.
- **For chroma-key**, prefer `#ff00ff` for green subjects, `#00ff00` for
  brown/tan subjects. The plant decoration uses #ff00ff; the capybara
  uses #00ff00.

Current generated assets:

| File | Generated for |
|---|---|
| `public/decor/leaves.png` | Hero — tall tropical sprig (monstera, fern, palm, philodendron, heliconia) |
| `public/decor/sprig-side.png` | IWantTo — sparser tropical sprig on the right of the cards |
| `public/decor/icon-want-*.png` | IWantTo card icons (globe, plant, certificate, book) |
| `public/decor/icon-step-*.png` | HowItWorks step icons (globe+mag, doc+leaf, hands+plant, tree) |
| `public/decor/icon-{globe,plant,leaf}.png` | ChoosePath ring-bordered icons |
| `public/decor/topo-decor.png` | NatureCTA — topographic contour decoration |
| `public/codex-pets/capybara.png` | FloatingCapybara — pixel-art idle pose |

## Design tokens

All colour/spacing rules live in `app/globals.css`. The token names are:

```
--background      cream #f4efe4
--foreground      near-black #1c1c1a
--muted-foreground stone #5b5b56
--primary         forest #335a3c
--primary-foreground bone #f6f2e8
--primary-dark    deeper #2a4a31
--border          warm grey #d9d3c3
--border-soft     paler #e6dfd0
```

If you need a new colour, add a token in `globals.css` first and reference
it via `var(...)` or its Tailwind `theme inline` alias (e.g.
`text-foreground`). Don't hand-pick raw hex values inside components —
the existing palette is deliberately small.

Typography:

- `font-garamond` → Cormorant Garamond (headlines, card labels, accents)
- `font-instrument` → Instrument Serif (italic accents, e.g. "or")
- `font-sans` → Inter (body & UI)

## Brand mark

`Logo.tsx` renders `/decor/gainforest-logo.svg` as a CSS `mask-image` so
the artwork follows `currentColor`. The SVG itself has its viewBox
tightened to `62 63 377 377` — don't restore the original `0 0 500 500`
or the leaf will look "cut" in small slots (the path lives off-centre in
the original viewBox).

## Coding style

- **Components**: functional, default-exported when they're a page or
  layout, named-exported otherwise.
- **Server components are async** when they need data; pass props down.
  Client components receive serialisable props (the `snapshot` and
  `pins` are simple JSON-safe objects).
- **No state managers**. The page is server-rendered and only a couple
  of components are interactive (globe, capybara, sign-in popover) —
  local `useState`/`useRef` is fine.
- **Comments earn their keep.** Explain *why* something is the way it
  is, especially when a value mirrors an upstream behaviour ("matches
  green_globe's spinGlobe", "literal port of useIndexedOrganizations",
  "port of simocracy's atproto-session", etc.). Don't restate what the
  code obviously does.
- **Imports**: `import type` for types; the `@/` alias is not configured
  (only `next-env.d.ts` and built-ins), so relative paths within `app/`.

## Don't:

- Don't add fake / inline mock data to the rendered UI. Use the libs.
- Don't replace the Capybara sim's persona with a hard-coded prompt —
  always read it from the owner's PDS via `getCapybaraPersona()`.
- Don't bypass the green_globe filter. If a pin shouldn't show, it's the
  upstream's job to suppress it — propose a fix in green_globe, not here.
- Don't add a state manager (Zustand, Redux, …). The page is read-only.
- Don't add a CSS-in-JS library; Tailwind v4 + `globals.css` is enough.
- Don't switch the globe back to a heavy renderer (Mapbox, Cesium) without
  a serious reason — and update this doc if you do.
- Don't embed a Mapbox token into the repo. The token in `.env.local`
  during the initial exploration was the public token from gainforest.app's
  JS bundle and is not committed.
- Don't hand-code SVG for decorative botanicals or topographic contour
  patterns. Generate via gpt-image-2 + chroma-key. The one inline SVG
  we tried (`NatureCTA` contour ovals) looked mechanical and was
  replaced.
- Don't log, print, or commit `ATPROTO_JWK_PRIVATE`.
- Don't write a custom session-cookie scheme — use `getSession()` from
  `_lib/auth-session.ts`.

## Build / verify checklist

Before finishing a change:

1. `pnpm exec tsc --noEmit` — clean.
2. `pnpm dev` and load `http://127.0.0.1:3030` (not `localhost`!). Globe
   rotates, both globes show pins, pings are visible, Bumicerts card
   lists 3 high-quality projects with thumbnails.
3. Drag the hero globe — rotation stops, no zoom on scroll, the page
   scrolls normally over the canvas.
4. Scroll to the bottom — "I want to…" cards render with their icons +
   tropical sprig on the right, "How it works" step icons + arrows
   render, "Nature thrives" banner shows the raster topo decoration.
5. Click the capybara (bottom-right) — speech bubble appears. Drag
   him somewhere else, reload — he stays put.
6. Click "Sign in" in the navbar — popover opens, type a bsky handle
   (e.g. `<your-handle>.bsky.social`), submit. Browser should redirect
   to your PDS for consent. On callback you should land back on `/`
   with a signed-in chip.
7. If you changed the design system, eyeball the cream background and
   primary colour against the original mockups
   (`/Users/david/Downloads/ChatGPT Image May 17, 2026, 12_31_25 PM.png`
   for the hero,
   `/Users/david/Downloads/02101890-2e05-463d-8151-44123926d31b.png`
   for the bottom sections) one more time.

## Updating this doc

When the data shape, filter logic, OAuth flow, globe behaviour, capybara
behaviour, or decoration pipeline changes, update the relevant section
here in the same commit. Stale agent docs are worse than no agent docs.
