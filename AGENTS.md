# AGENTS.md

Instructions for AI agents (Claude Code, etc.) working in this repository.
This is the landing page that fronts the two GainForest production apps —
[green_globe](https://github.com/GainForest/green_globe) and
[bumicerts-monorepo](https://github.com/GainForest/bumicerts-monorepo) —
and renders live data from both. It also hosts an ATProto OAuth sign-in
flow ported from simocracy-v2.

The **visual language follows [gainforest.earth](https://gainforest.earth)**
as of the May 2026 redesign — minimal editorial, big serif headlines
with a single italic word, a mostly-cream editorial rhythm punctuated by
the dark `DataCommons` band and the integrated closing `Footer`. The previous
tropical sprigs and the hand-drawn icon PNGs were dropped per team
feedback ("thin-stroke art doesn't match the rendered apps; tone is
too light"). The earlier pixel-art capybara floating companion was
temporarily un-mounted during the same pass, then brought back as
<FloatingTaina /> — same widget, swapped to point at the Taina sim
(GainForest's actual community-facing AI assistant born from
co-design with Indigenous communities around Manaus) instead of the
Capybara sim, so the pixel-art tone now matches the content tone of
the page.

**One subtle deviation from gainforest.earth**: the team explicitly
rejected mint-green CTAs ("I really hate that gainforest green for our
buttons — it only works well for our logo") and asked us to use the
**Bumicerts primary** instead. Our `--primary` is therefore
`#3e7053` — the sage forest green that `alpha.fund.gainforest.app`
ships as its `--primary` token. Buttons on cream are a solid sage
pill; buttons on ink are a cream solid pill. The brand mint
(`--brand: #2fce8a`) is restricted to the logo plus a small set of
subtle live-data accents (LIVE badges, globe pin tooltips, signed-in
chip, active language row). When in doubt, do **not** add a new mint
fill — lean on the sage primary.

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
  draggable codex-pet widgets. `FloatingTaina.tsx` is the parallel
  GainForest port and is **kept on disk but no longer mounted in
  `layout.tsx`** (May 2026 redesign feedback). Re-mount only if the
  product direction changes.

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
   `<LiveGlobe>`, `<SignInPopover>`, `<FloatingTaina>` and other
   components that need browser APIs are `"use client"`. Don't move
   data-fetching to the client unless there's a reason — server fetches
   share Next's `revalidate` cache and stay out of the bundle.
6. **Decoration is sparse.** The May 2026 redesign **removed** every
   illustrated PNG — `leaves.png`, `sprig-side.png`, `icon-step-*.png`,
   `icon-want-*.png`, `icon-globe.png`, `icon-plant.png`,
   `icon-leaf.png`, `topo-decor.png` — because their thin-stroke art
   didn't match the chunky live UI windows (Globe + Bumicerts). The
   files still live in `public/decor/` for backwards-reference; do not
   re-import them without explicit team approval. Visual weight now
   comes from whitespace, the serif headline, the italic emphasis word,
   and the live cards — the same recipe gainforest.earth uses.
7. **OAuth secrets stay in env.** `ATPROTO_JWK_PRIVATE` is the only
   secret the app needs and is generated via `scripts/generate-jwk.mjs`.
   Never log it, never print it, never commit it.

## Where things live

```
app/
├── page.tsx                       async server component; the entry point
├── layout.tsx                     fonts + metadata + mounts <FloatingTaina>
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
│   └── taina-sim.ts               Taina sim metadata + PDS persona loader
├── api/
│   ├── oauth/login/route.ts       GET — start OAuth from ?handle=
│   ├── oauth/callback/route.ts    GET — finish OAuth, issue session cookie
│   ├── auth/logout/route.ts       POST (GET alias) — clear session
│   ├── auth/whoami/route.ts       GET — JSON status
│   └── sim-chat/route.ts          POST — stream Taina chat (OpenRouter)
├── client-metadata.json/route.ts  OAuth client metadata document
└── jwks.json/route.ts             public JWKs

public/decor/                      generated raster decorations
public/codex-pets/                 taina sim sprites (mirrored from PDS)
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
ProjectPin { did, name, country, lat, lon, imageUrl }
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

`TopNav` is now a minimal landing-local header: logo, language picker,
and hash anchors into the page sections only. It intentionally does not
mount `SignInPopover` or outbound product CTAs, so the OAuth endpoints
remain available for direct flows but are not exposed from the top nav.

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

## FloatingTaina (the Taina sim)

`app/_components/FloatingTaina.tsx` is a port of
`simocracy-v2/components/feedback/floating-einstein.tsx`, pointed at a
real Simocracy sim instead of the bundled Einstein. The chosen sim is
Taina — GainForest's actual community-facing AI assistant, born during
the XPRIZE Rainforest from co-design with Indigenous communities around
Greater Manaus. The earlier iteration of this component pointed at the
Capybara sim; the team's verdict was "I liked the widget but didn't
like that it was a capybara — use Taina instead". The swap kept the
entire widget intact (drag/persist, chat panel, codex-pet animation)
and only changed the sim binding.

- Sim AT-URI:
  `at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m`
- Name: `Taina` — owned by `@daviddao.org`.

### Assets

The sim's codex-pet sheet and idle PNG are mirrored under
`public/codex-pets/`:

- `taina-poster.png` (~20 KB) — static poster, covers the canvas load
  gap until the first sprite frame paints.
- `taina-sheet.webp` (1536×1872, ~1.9 MB) — full 8×9 codex-pet sheet
  (idle / running-{left,right} / waving / jumping / failed / waiting /
  running / review).

If the owner edits the sim's blobs on simocracy.org, refresh both files
from the owner's PDS (`com.atproto.sync.getBlob?did=&cid=`). The CIDs
are in the sim record (`com.atproto.repo.getRecord?repo=&collection=org.simocracy.sim&rkey=`)
under `value.image.ref.$link` and `value.petSheet.ref.$link`.

### Behaviour

- Sits 32 px from the bottom-LEFT on desktop / bottom-RIGHT on mobile on
  first mount (the desktop default is left so it balances the
  right-weighted hero composition; mobile is right because the
  single-column layout would constantly overlap a left-anchored
  sprite). Drag anywhere; position persists in `localStorage` under
  `gainforest.floatingTaina.position.v1`. Bumping the key suffix is
  the right move whenever the default-position logic changes.
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

1. `getTainaPersona()` (in `app/_lib/taina-sim.ts`) resolves the
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

- **Don't bypass `taina-sim.ts`.** The sim's persona is loaded from
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
  brown/tan subjects. The plant decoration uses #ff00ff; the Taina
  uses #00ff00.

Current generated assets:

| File | Generated for |
|---|---|
| `public/decor/leaves.png` | Hero — tall tropical sprig (monstera, fern, palm, philodendron, heliconia) |
| `public/decor/sprig-side.png` | IWantTo — sparser tropical sprig on the right of the cards |
| `public/decor/icon-want-*.png` | IWantTo card icons (globe, plant, certificate, book) |
| `public/decor/icon-step-*.png` | HowItWorks step icons (globe+mag, doc+leaf, hands+plant, tree) |
| `public/decor/icon-{globe,plant,leaf}.png` | ChoosePath ring-bordered icons |
| `public/decor/topo-decor.png` | Retired closing CTA — topographic contour decoration |
| `public/codex-pets/taina-poster.png` | FloatingTaina — pixel-art idle pose (poster fallback) |

Current **gainforest.earth-sourced** documentary assets (not
gpt-image-2 — pulled directly from gainforest.earth's Equitable AI /
Indigenous AI Assistant / Impact Report sections; **do not
regenerate**, refresh from the source if gainforest.earth updates):

| File | Source on gainforest.earth | Used in |
|---|---|---|
| `public/videos/pillar-ai-assistants.mp4` (+ `-poster.webp`) | `_assets/video/0704a1c2…mp4` (99 s portrait doc — Marina Mura + the Taina interface); full clip, re-encoded | EquitableAI pillar 1 — autoplay loop |
| `public/videos/pillar-bioacoustics.mp4` (+ `-poster.webp`) | `_assets/video/610cc931…mp4` (167 s portrait doc — green audio recorder + Oceanus Conservation mangrove fieldwork: "audio can record 24 seven", "measures without seeing it"); full clip, re-encoded | EquitableAI pillar 2 — autoplay loop |
| `public/videos/pillar-remote-sensing.mp4` (+ `-poster.webp`) | `_assets/video/a21b2c9c…mp4` (30 s landscape doc — aerial canopy with tree-crown segmentation polygons), trimmed to 0:00–0:15 | EquitableAI pillar 3 — autoplay loop |
| `public/videos/taina-feature.mp4` (+ `-poster.webp`) | First-party GainForest footage (portrait doc — Indigenous scientists from Greater Manaus speaking about Taina, including Vanda Witoto); re-encoded full clip ~46 s | TainaFeature right-column — autoplay loop |
| `public/decor/impact-report-cover.webp` | `_assets/media/4e48bc46…png` | ImpactReport — "3rd Annual Impact Report" PDF cover thumb |
| `public/community/impact-group.webp` | `_assets/media/7d7dd0dc…jpg` | ImpactReport collage top — XPRIZE Rainforest team + community at the maloca |
| `public/community/impact-ceremony.webp` | `_assets/media/836d2f75…jpg` | ImpactReport collage bottom — Bumicerts certificate ceremony, Philippines |

Documentary subtitles baked into the videos ("Taina is an artificial
intelligence", "when it's the insect, the singing when the bats are
singing", "Saving information in Taina is very easy") are kept on
purpose — they reinforce the editorial documentary tone better than
clean caption-less crops would. If you re-trim a clip, prefer a
segment with similarly useful caption text.

### Partners section

`app/_components/Partners.tsx` must stay wired to `fetchProjectPins()`;
that fetcher calls Green Globe's `list-organizations?info=true&mapPoint=true`
route, then enriches the filtered pins from Hyperindex
`appGainforestOrganizationInfo` cover/logo blob refs resolved through each
org's PDS. Do **not** replace the live partner globe/spotlight with made-up
categories like "Indigenous Councils" or "Climate Funds". The spotlight in
`PartnersClient.tsx` should render real organization / community names from
`ProjectPin.name`, country codes from `ProjectPin.country`, and real images
from `ProjectPin.imageUrl` when available. The spotlight and globe must use
the same `pins` array so the names, countries, images, and map agree. If the
upstream is down, the only acceptable fallback is the fallback already owned
by `app/_lib/projects.ts`. The small "monthly community calls" card links to
`https://www.youtube.com/@gainforest/videos`, where the team publishes
recurring community-call recordings and steward sessions; keep that as a
subtle CTA rather than a separate fake data feed.

### Adding Awards & press / news carousel items

The carousel lives in `app/_components/Media.tsx`; all user-facing copy
for curated items lives in `app/_lib/i18n.ts`; cover images live under
`public/decor/news/<slug>.jpg`. When adding a new item:

1. **Research first.** Verify the source URL, title, publication date,
   publisher, and article/video thumbnail. Prefer `fetch_content` /
   `web_search` for pages that block `curl`; use `yt-dlp --dump-json`
   for YouTube metadata. Keep the final link pointed at the real article,
   talk, or work page (not a homepage placeholder).
2. **No personal-name framing.** If an article title includes a founder or
   team member, rewrite our carousel headline/summary to describe
   GainForest, Taina, Bumicerts, the community work, or the partner org.
   Proper nouns in original source titles may remain when they are the
   article title, but our copy should not center individuals.
3. **Localise curated copy.** Add `media.items.<slug>.headline` and
   `media.items.<slug>.summary` to the `Messages` type and provide all
   five locale blocks: EN, ES, PT, SW, ID. Article titles/proper nouns can
   stay in source language; section labels/kinds and summaries translate.
   Blog posts are the exception: they come from Substack RSS and stay in
   source language.
4. **Use a real cover when possible.** Prefer `og:image`,
   `twitter:image`, RSS `<enclosure>`, or YouTube `maxresdefault.jpg`.
   Download it to `public/decor/news/<slug>.jpg`, strip metadata, and
   normalize to 1600×900 JPEG:
   `magick in -strip -resize '1600x900^' -gravity center -extent 1600x900 -quality 85 public/decor/news/<slug>.jpg`.
5. **Generate only as fallback or replacement.** If the publisher blocks
   image access, exposes no image, or the real image badly clashes with the
   editorial system, use `codex-imagegen` / gpt-image-2. Prompt for a
   premium editorial 16:9 cover in the GainForest palette (cream, sage,
   muted gold, ink), no text, no logos, no watermarks, no identifiable
   faces, and no UI chrome. Normalize the result the same way.
6. **Wire the item.** Add the slug to `CuratedSlug`, add one object to
   `CURATED_ITEMS` with `kind`, ISO `sortDate`, `source`, `href`, and
   `image`. Keep newest-first sorting data-driven; the array can be
   loosely chronological but sorting uses `sortDate` at runtime.
7. **Verify.** Run `pnpm exec tsc --noEmit` and `pnpm build`. Open the
   page at `http://127.0.0.1:3030`, check the carousel on mobile and
   desktop, and switch at least one non-English locale to confirm the new
   copy is localised.

### Video re-encode pipeline

The upstream MP4s are 15–49 MB each and behind Cloudflare bot
management, so the pipeline goes through the browser session and
then ffmpeg, **not** curl:

1. Open gainforest.earth, click each tile's Play button so the
   `<video src>` attaches in the DOM.
2. `fetch()` each src **inside the browser** (Cloudflare won't
   serve curl). Stream the bytes back in 4 MB base64 chunks via
   `agent-browser eval`, reassemble to `/tmp/gf-videos/<hash>.mp4`.
3. `ffmpeg -ss <start> -i <in> -t <dur> -vf scale=<w>:-2,fps=24 -c:v
   libx264 -preset slow -crf 26 -movflags +faststart -pix_fmt
   yuv420p -an <out>` — trim to ~15 s, scale to 480 portrait or
   720 landscape, drop audio (autoplay requires muted anyway).
4. Extract a `.webp` poster at `-ss 2` so the card never shows a
   black frame while the video buffers.

Total payload after re-encode: ~7.6 MB across all 4 videos, vs
116 MB raw. Keep the trimmed clips ~15 s so the loop feels ambient
rather than alarming, and so each card's MP4 stays under ~3 MB.

## OG / share image

The Open Graph image at `public/og/landing-<date>.png` is **not**
hand-drawn or gpt-image-2 generated. It's rendered from a
self-contained HTML template via headless Chrome so the share card
matches the live hero exactly — same Cormorant Garamond + Instrument
Serif headline, same curved hand-drawn brush stroke under "Open",
same cream / sage palette, and a real GainForest documentary photo
on the right half (default: `public/data-commons/community-mangrove.webp`,
the Oceanus Conservation mangrove fieldwork shot).

Why this approach instead of gpt-image-2: gpt-image-2 hallucinates
font shapes, often gets the curved brush stroke wrong, and tends to
re-introduce decorative leaves the team explicitly stripped from the
page. Rendering from real HTML guarantees pixel-perfect typography
and a real photograph behind the copy.

Pipeline:

1. `scripts/og-template.html` is the canvas — a self-contained 1200×630
   page that imports the same Google Font families `app/layout.tsx`
   loads, embeds the gainforest-logo SVG, and uses the literal
   `BRUSH_PATH` from `Hero.tsx`.
2. `scripts/render-og.sh [YYYY-MM-DD]` substitutes absolute `file://`
   paths into the template, runs Chrome with
   `--headless=new --window-size=1200,630 --force-device-scale-factor=2`,
   and down-samples the 2400×1260 capture to a crisp 1200×630 PNG +
   matching JPG via ImageMagick.
3. Bump `OG_IMAGE_PATH` in `app/layout.tsx` to the new versioned
   filename. Telegram / Twitter / Bluesky cache OG by URL, so changing
   only the bytes behind the old path doesn't refresh shared previews.

The previous landings (`landing-2026-05-19.png`, etc.) stay on disk
so old shared previews keep working until the upstream caches expire.
Never overwrite a dated OG — always render a new one and bump the path.

## Design tokens

All colour/spacing rules live in `app/globals.css`. The token names are:

```
--background         cream #f4efe4         (light section bg)
--foreground         near-black #1c1c1a    (body text on cream)
--muted-foreground   stone #5b5b56         (rare; we prefer foreground/70 in Tailwind)
--primary            sage forest #3e7053   (Bumicerts primary; cream-section CTA fill)
--primary-dark       deeper sage #2e5840   (hover / pressed)
--primary-foreground off-white #fafafa     (text on the sage pill)
--brand              mint #2fce8a          (logo + subtle live-data accents only)
--brand-dark         deeper mint #21b073   (text-on-mint where contrast matters)
--border             warm grey #d9d3c3
--border-soft        paler #e6dfd0
--ink                near-black #141413    (dark section bg)
--ink-foreground     cream #f4efe4         (text on ink + cream-pill CTA on dark)
--ink-muted          stone #a8a59a         (subtle text on ink)
--ink-border         #2a2a27               (rules on ink)
```

**Brand split:** `--brand` (#2fce8a) is the mint that lives in the
logo SVG fill and re-appears — *subtly* — on live-data accents (LIVE
badges, globe pin tooltip labels, signed-in chip, active language row).
It is **never** used as a solid button background. `--primary` is the
call-to-action colour (near-black on cream, swapped to cream-on-ink on
the dark band). Do not collapse the two back into one token; the
separation is deliberate per team feedback.

**Section rhythm:** the page is mostly cream, with two deliberate
near-black beats: `DataCommons` (mid-page WHY / 1% biodiversity-data
claim) and the integrated closing `Footer` band. `ImpactReport`
used to be a dark card inside a cream section, but as of the
media-pass update it sits on a warm apricot card (matching
gainforest.earth) so the only dark chord on the lower half is the
closing footer. Keep the dark surfaces sparse and editorial so the
cream → ink contrast lands hard without turning the whole page into
a dark alternation pattern.

If you need a new colour, add a token in `globals.css` first and reference
it via `var(...)` or its Tailwind `theme inline` alias (e.g.
`text-foreground`). Don't hand-pick raw hex values inside components —
the existing palette is deliberately small.

Typography:

- `font-garamond` → Cormorant Garamond (headlines, card labels, accents)
- `font-instrument` → Instrument Serif (italic accents, e.g. "or")
- `font-sans` → Inter (body & UI)

## Hero headline

The hero composes its h1 as `before` + italic(`italic`) + `after`
from `i18n.ts`. The italic phrase renders as **plain italic** (no
underline, no brush) — it sits as a quiet contrast to the brushed
word above it.

A single **curved, hand-drawn SVG paintbrush stroke** lives under one
marked word inside `before`. The implementation is in `Hero.tsx`:

- `before` carries an inline `{word}` marker that flags which word
  should receive the brush stroke. The marker position varies per
  locale because the equivalent of English "Open" sits in different
  parts of the sentence: English `{Open} tools for`, Spanish
  `Herramientas {abiertas} para la`, Indonesian `Alat {terbuka}
  untuk`, and so on.
- `parseBrushed()` (in `Hero.tsx`) walks the string and returns an
  ordered array of `{ brushed?: true; text }` segments. Plain text
  outside the marker comes through verbatim — spaces and all — so
  word boundaries render naturally without extra fiddling.
- The brush itself is a `BRUSH_PATH` **stroked** cubic curve inside
  a 178×16 viewBox — ported verbatim from the Bumicerts reference
  at alpha.fund.gainforest.app (the "Real Communities" underline):
  - path: `M 3 10.5 C 44 6.5 87 6 175 8.5`
  - `fill="none"`, `stroke="currentColor"`, `stroke-width="2.25"`,
    `stroke-linecap="round"`
  The curve sweeps from `(3, 10.5)` on the left up through control
  points `(44, 6.5)` and `(87, 6)` and lands at `(175, 8.5)` on the
  right — left tip slightly lower than the right, peak around `y=6`
  in the middle. The asymmetric arc reads as a hand-drawn paint
  stroke rather than a symmetric lens. The team explicitly asked for
  "curved not straight", so this arc must stay visible — don't
  flatten it.
- The brushed word is wrapped in `position: relative inline-block`
  with the SVG `absolutely-positioned` at `-bottom-2`, `h-4`,
  `w-full`, `preserveAspectRatio="none"`. The stroke stretches with
  the word width; the curve flattens horizontally for wider words
  and steepens for narrow ones, which is the trade-off we accept to
  keep the stroke hugging its anchor.

Why a stroked cubic curve, and **not**:

- `text-decoration: underline` — mechanically straight, no arc, no
  brush feel. The team called this "ugly".
- A single absolute `<span>` with a 4–7 px solid rounded bar — reads
  as a highlighter pill, not a stroke. The team called this "ugly"
  first.
- A filled lens-shaped path (the previous iteration) — tips taper
  to zero width but the centerline arc gets visually crushed when
  the SVG is stretched to fit the word, so the brush ends up
  reading as a flat line. The stroked cubic curve keeps a visible
  arc at any width.
- Brushes under multiple words (the previous iteration's per-italic
  word treatment) — the team narrowed it to one stroke: "only under
  Open".

The Bumicerts hero on
[alpha.fund.gainforest.app](https://alpha.fund.gainforest.app) — the
"Real Communities" line — is the visual reference. Keep the stroked
cubic curve, keep it on one marked word, keep the visible arc.

Current english copy: `{Open} tools for` + *regenerative
intelligence*. Tech-forward, plain English¹.
¹ The previous "One home for regenerative impact" line is in the git
history; do not revive it unless the product framing shifts back.

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
  of components are interactive (globe, taina sprite, sign-in popover) —
  local `useState`/`useRef` is fine.
- **Comments earn their keep.** Explain *why* something is the way it
  is, especially when a value mirrors an upstream behaviour ("matches
  green_globe's spinGlobe", "literal port of useIndexedOrganizations",
  "port of simocracy's atproto-session", etc.). Don't restate what the
  code obviously does.
- **Imports**: `import type` for types; the `@/` alias is not configured
  (only `next-env.d.ts` and built-ins), so relative paths within `app/`.
- **No em-dashes in user-facing copy.** Team rule: every — visible to a
  visitor is rewritten to `;`. JSX text, alt / aria attributes, error
  toasts, page titles, OG / Twitter / JSON-LD metadata, i18n string
  values — all swept. Comments and the Taina LLM system prompt keep
  their em-dashes (they're not rendered).
  - `scripts/em-dash-sweep.mjs` walks the TypeScript AST and only
    rewrites `StringLiteral` / `JsxText` / template-literal text spans;
    comments are skipped because `node.getStart(sourceFile)` excludes
    leading trivia.
  - `pnpm sweep:emdash` runs the sweep over a curated TARGETS list.
  - `pnpm check:emdash` is the CI-friendly mode (exits non-zero with
    file:line for any user-facing — found).
  - A versioned pre-commit hook at `.githooks/pre-commit` runs the
    sweep on every staged `.ts` / `.tsx` file and re-stages the
    rewrites. `pnpm install` (via the `prepare` lifecycle script and
    `scripts/install-git-hooks.mjs`) wires `core.hooksPath` to
    `.githooks/` once per clone. Bypass with `git commit --no-verify`
    if you ever need to.

## Don't:

- Don't add fake / inline mock data to the rendered UI. Use the libs.
- Don't replace the Taina sim's persona with a hard-coded prompt —
  always read it from the owner's PDS via `getTainaPersona()`.
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
  we tried (retired closing CTA contour ovals) looked mechanical and
  was replaced.
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
4. Use the top navbar anchors. They should scroll to in-page sections
   (`#tools`, `#how-it-works`, `#data-commons`, `#ai`, `#partners`,
   `#impact`) and never open outbound app URLs.
5. <FloatingTaina /> mounts in `layout.tsx` and stays open across
   routes.
6. If you changed OAuth, test the direct login route with
   `/api/oauth/login?handle=<your-handle>.bsky.social`; the top navbar
   no longer exposes a sign-in popover.
7. If you changed the design system, eyeball the cream background and
   primary colour against the original mockups
   (`/Users/david/Downloads/ChatGPT Image May 17, 2026, 12_31_25 PM.png`
   for the hero,
   `/Users/david/Downloads/02101890-2e05-463d-8151-44123926d31b.png`
   for the bottom sections) one more time.

## Updating this doc

When the data shape, filter logic, OAuth flow, globe behaviour, taina
behaviour, or decoration pipeline changes, update the relevant section
here in the same commit. Stale agent docs are worse than no agent docs.
