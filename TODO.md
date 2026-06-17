# TODO — Marketplace / Evaluation Platform Improvements

Source: full UI/UX review (2026-06-10) of the site as a marketplace + evaluation
platform for environmental credits (Certs). Reviewed: home, /certs,
/organizations, /observations, /donations, /leaderboard, cert detail pages,
donate modal, sign-in, map/list views, dark + light themes, mobile viewport.

**Core finding:** the site reads as a story gallery, not a marketplace. Buyers
scan for *signal* (verified? how much? how funded? what outcome?) but cards and
detail pages are optimized for prose + photos. Money state, evidence state, and
evaluation state need to be visible at every level: card → detail → checkout.

Legend: `[ ]` open · `[x]` done · `[~]` partially done

---

## P0 — Conversion & honesty

- [x] **Funding signals on explorer cards** — cards showed zero commerce state
  even though an "Accepts donations" filter exists. Added a cached funding
  index (open funding configs + receipt totals) and an "Accepting donations /
  $X raised" pill on `/certs` cards and list rows.
- [x] **Fix the "Accepts donations" client-side filter** — its predicate was
  `() => true` (every loaded record passed). Now checks the funding index.
- [x] **Remove dead donate UI on non-donation projects** — detail page showed
  "Donations are not applicable" *plus* "Raised $0 / Donations 0" *plus* a
  disabled Donate button. Now renders a compact "not accepting donations"
  note instead of dead commerce UI (sidebar + donations tab).
- [x] **Funding goal + progress bar** — `goalInUSD` exists on funding configs
  but was never displayed. Show progress (raised / goal) on the detail
  sidebar and donations tab when a goal is set.
- [x] **Suppress creation-wizard template text** — live cards showed
  "Inspire others to support you. Share about your land…" (×3),
  "Share Your Story, Build Your Community", "Project story" as their real
  descriptions. Sanitized at the data layer.
- [x] **Hide obvious test records from public catalogs** — e.g. "Disposable
  E2E Forest Org Edited" appeared in /organizations. Filtered records whose
  title/name matches disposable-E2E test patterns (manage pages unaffected,
  e2e specs assert only on /manage).
- [x] **2-line titles on cards** — `line-clamp-1` truncated most project names
  ("Trees for Himalayas,…", "FarmIT: A…"). Titles are the product name.
- [x] **Fix "1 people named" grammar** — pluralize person/people everywhere.
- [x] **Honest search placeholder** — placeholder promised "name, keyword, or
  location" but bumicert search only matches title/short description.
- [x] **Stop hiding inventory by default** — explorer defaulted to the
  "Shows photos" filter, silently dropping ~45% of records. Default is now
  "All Bumicerts" (old `?filters=` links still work).
- [x] **Concise card aria-labels** — card buttons exposed the entire card text
  (title + description + pills + org) as their accessible name.

## P1 — Trust & evaluation layer

- [~] **Evidence-completeness badge** on cards + detail header — DONE on the
  detail page: an "Evidence" section with linked chips (site boundaries ·
  nature sightings + latest date · timeline items), zero-states muted so
  evidence-rich and evidence-light certs are distinguishable. Cards show a
  sightings pill (one batched count query per page of DIDs). Remaining:
  photos/reports breakdown on cards, and an aggregate score.
- [~] **Link observations to bumicerts visibly** — DONE at org level: detail
  evidence chip ("N nature sightings · latest X ago") and card pill.
  Remaining: site-level linkage (sightings within the claim's certified
  locations, not just the same publisher DID).
- [x] **Quantified claims: format + validate** — area scope tags are now
  normalized at the data layer ("⭔ 24164249 ha" → "⭔ 24.2M ha"); areas
  larger than any country (>1.5B ha) are dropped as bad data. Remaining:
  validation at creation time.
- [~] **Evaluation records (ATProto)** — READ SIDE DONE. New "Reviews" tab on
  bumicert detail pages renders:
  - `org.hypercerts.context.evaluation` records (summary, optional numeric
    score rendered as "8/10" badge, report links, evaluator identity = repo
    owner DID, relative date) from the GainForest hyperindex — 110 records
    already exist. Drained + indexed by `subject.uri` in
    `app/_lib/reviews.ts` (the GraphQL `where` only has a presence filter
    on subject), 5-min cache, same pattern as `funding-summary.ts`.
  - `org.impactindexer.review.comment` threaded comments from the Simocracy
    indexer (`simocracy-indexer.gainforest.id` — the GainForest hyperindex
    does NOT ingest this collection), with sim authorship joined from
    `org.simocracy.history` sidecars (`type: "comment"`): sim-authored
    comments get a bot icon + "AI sim" pill linking to
    simocracy.org/sims/{did}/{rkey}.
  - Overview Evidence strip gained a "N evaluations · M comments" chip.
  Remaining (write side + protocol):
  - Publish-an-evaluation flow for signed-in evaluators (lexicon docs:
    hyperscan.dev/agents → /agents/lexicon/org.hypercerts).
  - Owner responses via `org.hypercerts.context.acknowledgement` (subject =
    evaluation, acknowledged bool + comment) — 0 records exist today; show
    "acknowledged by project" badges once they appear.
  - `org.hypercerts.context.measurement` references on evaluations — render
    metric/unit/value chips when evaluations start carrying them.
  - Surface aggregate review signal on catalog cards (avg score / count).
- [ ] **Verified-org tier** — a "verified by GainForest" badge + default
  catalog view; requires a curation/moderation surface.
- [ ] **Donor identity prompts** — top donor is "Anonymous supporter" ($19.2K
  of $26.9K total): social proof is wasted. Prompt to attach name/pseudonym
  at donation time; let anonymous donors pick a display alias.
- [~] **Empty-tab annotations** — the overview Evidence chips now carry the
  counts and link into the Site Boundaries / Timeline tabs, so visitors see
  "No timeline evidence yet" before clicking. Remaining: counts in the tab
  strip itself (lives in AppShell's header bridge).

## P2 — Marketplace depth

- [ ] **Fiat payments** — donate flow is USDC + wallet only ("Continue to
  wallet"); caps the audience at crypto-natives. Average donation $153.94 is
  card territory (Stripe / embedded-wallet providers).
- [ ] **Donor portfolio + updates** — "you've supported 3 projects, here's
  what happened since": account page section, email/notification when a
  supported project posts evidence, shareable receipt pages.
- [ ] **Buyer-oriented sorts** — "Most funded", "Trending", "Recently active",
  "Closest to goal" (needs funding index server-side or at sort time).
- [ ] **Full-catalog map** — map view only plots loaded pages (pan to Africa →
  5 pins + "Load more" under the map). Add a lightweight geo query that
  returns all coordinates for map mode.
- [ ] **Country facet for projects** — organizations have one, projects don't.
- [x] **Donate modal transparency** — the amount step now states that 100%
  goes directly to the organization's verified wallet (no platform fee,
  network fee covered) and that the donation becomes a public, auditable
  receipt.
- [ ] **Recent-donor social proof on detail pages** — "12 people supported
  this, most recently 2 days ago" near the Donate button.
- [ ] **Credits vs crowdfunding decision** — if "credits" is meant literally,
  unitization is missing entirely: quantity, unit price, ownership,
  retirement ledger. Decide the model; current UI is project crowdfunding.

## P3 — Reach, SEO, polish

- [x] **Sitemap detail URLs** — sitemap had only 8 section URLs; every project
  page is a marketplace landing page. Now emits bumicert detail pages.
- [x] **JSON-LD structured data** on bumicert detail pages (Project +
  DonateAction when accepting donations).
- [x] **Organizations fallback art** — broken-image (`ImageOff`) icons
  dominated the org grid; replaced with branded leaf-on-gradient fallback.
- [ ] **SSR first explorer page** — explorer pages render empty HTML for
  crawlers (`revalidate = 60` does nothing; clients fetch everything).
  Clients already accept `initialRecords`/`initialPage` props. Needs care:
  the client-only choice was deliberate (Vercel static-gen timeout); guard
  with a short timeout + fallback to client fetch.
- [ ] **Real inventory on the home page** — "What exactly is a Bumicert" shows
  a hardcoded fictional project (Reforestation of Mount Halimun); the
  homepage shows no real projects at all. Feature live, funded projects.
- [ ] **Org card real signals** — replace generated boilerplate ("A nonprofit
  advancing community-led environmental stewardship.") with real counts:
  # bumicerts, # observations, total raised.
- [ ] **Body-level scrolling** — `main.overflow-y-auto` inner scroll container
  breaks PageDown/Space before focus, scroll restoration, fragment anchors.
- [ ] **Contrast / a11y audit** — muted text on glass pills in dark mode;
  focus states in drawer; map keyboard navigation.
- [ ] **Drawer cleanups** — duplicate platform icons (two YouTube buttons) —
  done for the detail sidebar (dedupe by platform); verify RecordDrawer too.

---

## Simocracy sync — sims evaluating Bumicerts (plan)

Goal: surface Bumicerts inside a Simocracy community (../simocracy-v2) so AI
sims can deliberate, comment, and publish evaluations — and show all of that
back on bumicerts detail pages (display side shipped, see P1 above).

How the pieces fit (verified against live indexers + lexicons, 2026-06-11):

1. **Bumicerts ARE proposals already.** A Simocracy proposal is just an
   `org.hypercerts.claim.activity` plus an `org.simocracy.proposalContext`
   sidecar binding `subject.uri` to a gathering (or FtC SF floor). The
   sidecar may live in ANY repo (the proposer's repo outranks; latest
   `createdAt` wins within a tier) — so syncing requires zero writes to the
   bumicert owners' repos:
   - create one `org.simocracy.gathering` ("Bumicerts" community),
   - write one `proposalContext` per bumicert from the syncing account.
2. **Sims comment** via pi-simocracy `simocracy_post_comment` →
   `org.impactindexer.review.comment` + `org.simocracy.history` attribution
   sidecar. The bumicerts Reviews tab already renders both.
3. **Sims evaluate**: have the agent harness write
   `org.hypercerts.context.evaluation` records (subject = bumicert strongRef,
   summary + score). The GainForest hyperindex ingests that collection
   firehose-wide, so they appear on the Reviews tab automatically.

**Blocking gap (simocracy side, not this repo):** the simocracy indexer does
not ingest the bumicert publishers' DIDs (verified: ecocertain's DID returns
0 activity records there), and simocracy-v2's `fetchActivitiesByUris` /
`fetchRecordByUri` point-fetch also goes to the simocracy indexer — so synced
bumicerts would not render on simocracy.org. Fix options:
  a. add a PDS fallback to `fetchRecordByUri` in simocracy-v2 (smallest),
  b. make the simocracy indexer track DIDs referenced by proposalContext
     sidecars,
  c. point simocracy-v2's activity reads at the GainForest hyperindex, which
     already has all claim.activity records.

Agent-facing docs for all of this: https://hyperscan.dev/agents (lexicon
index, create-hypercert / post-comment write guides, auth guide).

## Implementation notes

- Funding index lives in `app/_lib/funding-summary.ts`: one cached pass over
  `appGainforestFundingConfig` (open + wallet set) joined with cached
  `fetchReceipts()` totals, keyed by bumicert at-uri.
- Template-text + test-record filters live in `app/_lib/indexer.ts`
  (`sanitizeShortDescription`, `isLikelyTestRecordName`) so every surface
  (cards, drawer, detail, search) benefits.
- e2e safety: disposable-org assertions only run on /manage pages, which use
  by-DID fetchers — public-catalog filtering does not affect them.
- Reviews layer lives in `app/_lib/reviews.ts`: evaluation index from the
  GainForest hyperindex + comment/sim-attribution indexes from the Simocracy
  indexer (generic `records(collection:)` endpoint), both cached 5 min.
  Gotcha: don't request `evaluators { did }` in the evaluation query — one
  malformed record nulls the entire connection via non-null bubbling.
