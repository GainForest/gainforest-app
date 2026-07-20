# GainForest feed lexicons (`app.gainforest.feed.*`)

Bluesky's feed primitives, adopted **verbatim** into the `app.gainforest.feed.*`
namespace, so the feed at `/feed` can grow from a read-only merge of records into
a feed you can **post to, comment on, and like** — just like a Bluesky timeline,
but over the GainForest commons (observations, projects, certs, organizations,
donations).

These are faithful ports of `app.bsky.feed.*`: same field shapes, same
`com.atproto.repo.strongRef` subjects (uri **+** cid), same reply model. We keep
the records in our own namespace but reference the standard atproto sub-lexicons
for everything they depend on (richtext, embeds, labels, strongRef) instead of
re-forking them.

## The records

| GainForest lexicon         | Ported from           | Purpose |
|----------------------------|-----------------------|---------|
| `app.gainforest.feed.post` | `app.bsky.feed.post`  | A feed post. A **comment is a reply-post** — a post carrying a `reply: { root, parent }`. |
| `app.gainforest.feed.like` | `app.bsky.feed.like`  | A like of any record/post/comment. Unlike = delete the record. |

There is **no separate comment lexicon** — that's the Bluesky model: a comment is
a `post` whose `reply.parent` points at the thing being commented on.

## Faithful to Bluesky — two deliberate, documented choices

1. **Subjects are real `com.atproto.repo.strongRef`** (uri **+** cid), exactly as
   Bluesky. This is stronger than the earlier draft's uri-only ref: a like /
   reply now pins the exact version it targets. **Consequence for wiring:** the
   write helpers must supply the subject's `cid`. `createRecord` returns the cid
   of records we create; for an existing feed record, read its cid first via
   `com.atproto.repo.getRecord` / `listRecords` (the feed's current
   `ActivityFeedItem.id` carries only the uri, so the cid has to be resolved at
   like/comment time).

2. **Comments target any record, via our appview.** Bluesky's lexicon already
   allows a reply's `root`/`parent` to be any record (it's a generic strongRef);
   Bluesky's *official appview* just ignores replies whose parent isn't a post.
   Because **we** run the hyperindex appview, a reply-post whose parent strongRefs
   an observation or a cert is honoured and threaded. Same lexicon as Bluesky,
   our appview simply chooses to recognise more subject types.

## Dependencies (resolved against `@atproto/api`'s bundled lexicons)

The ported records reference standard atproto lexicons we do **not** vendor here —
they ship with `@atproto/api` and are loaded into the proxy agent already:

- `com.atproto.repo.strongRef` — like/reply subjects.
- `app.bsky.richtext.facet` — `post.facets` (mentions, links, hashtags).
- `app.bsky.embed.images` / `video` / `external` / `record` / `recordWithMedia`
  — the `post.embed` union. Trim this union to whatever your client's lexicon
  bundle actually includes if you don't need the full set.
- `com.atproto.label.defs#selfLabels` — `post.labels`.

`entities` / `textSlice` from the Bluesky source were dropped — they're marked
deprecated there in favour of `facets`. `app.gainforest.feed.repost` (a verbatim
port of `app.bsky.feed.repost`) is a trivial add if reposts are wanted later.

## Bluesky cross-posting (`app.gainforest.actor.preferences`)

Because `app.gainforest.feed.post` is a faithful port of `app.bsky.feed.post`,
cross-posting to Bluesky is just writing the SAME record body a second time
into the user's own repo under the `app.bsky.feed.post` NSID, **reusing the
GainForest post's rkey** — so the mapping is deterministic
(`at://did/app.gainforest.feed.post/RKEY` ⇄ `at://did/app.bsky.feed.post/RKEY`,
public URL `https://bsky.app/profile/DID/post/RKEY`). The wiring lives in
`app/_lib/bluesky-crosspost.ts`.

Rules baked into the client:

- **Strictly opt-in.** The switch lives in the feed composer and account
  Settings; the FIRST activation is gated by an explicit consent modal
  (`app/_components/BlueskyConsentModal.tsx`). Nothing is ever written to an
  `app.bsky.*` collection before that consent.
- The preference + consent timestamp are stored in
  `app.gainforest.actor.preferences` (rkey `self`) — the same singleton
  pattern as `app.gainforest.notification.seen`, read straight from the PDS,
  not indexed.
- Accounts without an `app.bsky.actor.profile` get one created on consent,
  derived from their `app.certified.actor.profile` (name, bio, and the avatar
  blob by reference when it satisfies Bluesky's png/jpeg ≤ 1MB constraint).
- **Top-level posts only, personal repos only.** Replies reference GainForest
  records the Bluesky appview can't thread, and organizations (CGS repos)
  never cross-post.
- Twin writes are best-effort: the GainForest post is the source of truth and
  never fails because Bluesky did. Edits/deletes propagate to the twin
  best-effort too.
- The feed only renders a "View on Bluesky" link for twins the public Bluesky
  appview actually returns (`app.bsky.feed.getPosts`), so links never point at
  posts bsky.app can't show. Note this also means posts only surface on
  Bluesky if the PDS is crawled by a Bluesky relay (`com.atproto.sync.requestCrawl`).

## Relationship to the existing comment/review layer

The feed already reads `org.impactindexer.review.comment` (written by
simocracy.org users and AI sims) via the Simocracy indexer — see
`app/_lib/reviews.ts`. Reply-posts under `app.gainforest.feed.post` are the
GainForest-native equivalent; the intended end state is for the feed/detail
surfaces to read **both** and render them in one `subject`-keyed thread.

## Integration plan (what still needs wiring)

These JSON files define the schema; making the feed interactive needs three more
pieces, none of which is in this folder yet:

1. **Write helpers (this repo).** Add `createPost` / `createReply` (comment) /
   `createLike` / `deleteLike` to `app/(manage)/manage/_lib/mutations.ts`,
   reusing the existing `createRecord` / `deleteRecord` plumbing (CGS for
   group-owned repos, the manage proxy for personal repos). Resolve the subject
   `cid` for the strongRef (see choice #1). Gate the actions on the signed-in
   user's role per `AGENTS.md` (hide when signed out).

2. **Read path (hyperindex, separate service).** The GraphQL hyperindex behind
   `INDEXER_URL` must ingest `app.gainforest.feed.post` and
   `app.gainforest.feed.like`, expose `appGainforestFeedPost`, and aggregate
   likes/replies by subject uri (count + viewer-state) so `app/_lib/feed.ts` can
   show posts as feed rows and attach comment/like counts to every row. Until
   then the records are written and readable via `listRecords`, but won't appear
   in the merged feed.

3. **UI (this repo).** Add like + reply affordances to `FeedClient.tsx` (and the
   record detail drawers) plus a post composer, with translations for every new
   string in all configured languages (per `AGENTS.md`).
