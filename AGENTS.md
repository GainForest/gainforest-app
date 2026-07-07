# Agent Instructions

## User-facing language
Avoid adding new jargon or protocol details to the UI. Do not show handles, DIDs, or other technical identifiers unless they are truly necessary for the user to complete the task. Existing copy can stay, but new copy should prefer plain-language terms.

## Translations
Always add or update translations for new or changed user-facing UI copy. Keep support for all configured languages in sync, and avoid introducing hardcoded English strings in components, metadata, placeholders, labels, buttons, aria text, or validation messages.

## Mutation permissions
When adding any feature that creates, updates, deletes, or changes membership/roles, gate the available actions by the user’s current role before they can trigger them. Disable or hide unavailable options up front and use plain-language explanations.

## E2E test runs
When a user asks to run the full E2E suite, run it. The suite intentionally creates disposable accounts and organizations, and teardown is responsible for deleting them. Do not avoid a requested full E2E run because it uses disposable accounts; instead, watch cleanup output and report any teardown failure clearly.

## Data batch jobs (field-partner bulk ingest)
Field partners submit 5–10GB zip archives (photos + KoboToolbox CSVs in varying formats) as review "jobs" via `/submit-data`; the team oversees them on the `/admin` **Data batches** tab. Full architecture + setup: `docs/data-jobs.md`.

**Invariants to preserve when touching data jobs:**
- **Uploads never flow through the Next.js server.** The browser PUTs presigned multipart parts straight to S3-compatible storage (`app/_lib/s3-storage.ts`); Vercel's body limit makes any proxied upload path a regression.
- **Publishing on behalf uses a real GainForest agent key**, minted from the submitter's session on explicit consent, named exactly `DATA_JOBS_AGENT_KEY_NAME` so Settings → AI agent keys can badge it, stored only encrypted (`DATA_JOBS_KEY_SECRET`), and revocable by the user at any time. Never add a bespoke upload/publish endpoint.
- **Ownership comes from the session, never the request body**; admin routes are gated by `getGainForestModeratorAccess()`.
- The review team's actions never touch already-published observations; owner-side cancel only works while a job is still `uploading`.

## Tainá (Telegram field assistant)
Tainá lets a signed-in user connect their own Telegram bot and turn nature sightings (a photo or a note) into GainForest observations under their account. **This app is the primary front-end** for it; the agent itself runs in a separate always-on service.

**Two services:**
- **This app** (`www.gainforest.app`) — the UI + a thin, session-gated proxy. The `/taina` setup page (`app/taina/`), the private **Tainá** profile tab (`app/account/[did]/taina/` + `AccountTabContent`/`AccountTabBar`, owner-only), the sidebar **AI → Tainá** entry (`app/_components/AppShell.tsx`), the `/api/taina/{provision,dashboard,key,session,profile}` routes, and the server client `app/_lib/taina-agent.ts` (+ shared constants `app/_lib/taina-shared.ts`).
- **Flue runtime** (`../agent-village`, GitHub `GainForest/agent-village`, deployed on Railway at `agent-village-flue-production.up.railway.app`) — one Node process running each user's Telegram bot, the Tainá agent (chat on GLM 5.2, photo species-ID on Claude Sonnet 5), reminders, and a KV store. Its `AGENTS.md` is the source of truth for the agent internals.

**Invariants to preserve when touching Tainá:**
- **Auth reuses this app's session.** No separate Tainá login. The DID always comes from `fetchAuthSession()`, never the request body. The proxy authenticates to Flue with `TAINA_PROVISION_SHARED_SECRET`; the runtime URL is `TAINA_FLUE_BASE_URL` (both fall back to `PROVISION_SHARED_SECRET` / `FLUE_BASE_URL`, then dev defaults). These must be set on Vercel for production to reach the runtime.
- **Publishing uses a real GainForest agent key**, not a bespoke tool. Provision/regenerate mint a `gf_pat_…` key through the central auth service named exactly `TAINA_AGENT_KEY_NAME` ("Tainá — Telegram bot"), so Settings → AI agent keys can badge it. The bot follows the canonical `/skill.md` guide (`app/skill.md/route.ts`) with that key — the same flow any connected AI agent uses. Never reintroduce a custom upload endpoint.
- **Restart session** = `POST /api/taina/session` → runtime `/reset`: a fresh agent conversation, cleared transcript, re-greet. It must never touch the user's recorded observations.
- **Reset my agent** = `DELETE /api/taina/provision` → revoke the Tainá-named agent keys, then runtime `/deprovision` (bot stopped, resident record forgotten). Fully disconnects Tainá; recorded observations are never touched and the user can re-provision from scratch.
- **USER.md profile** = the personal "who I am" Markdown stored with the user's agent (max `TAINA_PROFILE_MAX_CHARS` = 12,000 chars). Edited in the Tainá tab's "Your profile" card → `PUT /api/taina/profile` → runtime `/profile`; the agent can also save it from Telegram via its `save_user_profile` tool. Both write the same runtime field.
- **Credit usage** comes back on the dashboard payload (`credits: { usedUsd, allowanceUsd }`, USD) — metered by the runtime from LLM turn costs + the vision step against its `CREDIT_ALLOWANCE_USD`. Older runtimes omit it; the UI must tolerate its absence.
- **Admin oversight** lives on `/admin` (Tainá agents tab): `GET /api/admin/taina` (roster — bot, owner handle, last used, credit spend) and `POST /api/admin/taina/message` proxy to the runtime's `/admin/residents` and `/admin/message`. Both are gated by `getGainForestModeratorAccess()` (GainForest admin-group members), not just any session. Admin messages are relayed THROUGH the observer's agent — delivered in Tainá's voice with no admin prefix — and require the bot to be activated.
- Telegram photos land in the agent's `/inbox` sandbox folder; the agent uploads them as blobs per the skill.

**Key links:** agent repo `https://github.com/GainForest/agent-village` · runtime `https://agent-village-flue-production.up.railway.app` · agent guide `https://www.gainforest.app/skill.md` · Flue framework `https://flueframework.com`.
