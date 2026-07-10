# Autoresearch: improve GainForest SEO

## Objective
Improve gainforest.app technical SEO and brand/entity signals so Google can better rank GainForest for direct and relevant sustainability searches. A top Google ranking cannot be guaranteed from code alone, so this loop optimizes measurable on-page and metadata factors that support ranking: titles, descriptions, canonicals, hreflang, crawlability, structured data, social previews, and sitemap coverage.

## Metrics
Current phase:
- **Primary**: `public_hreflang_gaps` (count, lower is better) — public pages whose page-level metadata overrides root metadata without preserving localized `hreflang` alternates.
- **Secondary**: `public_metadata_gaps` — missing/hardcoded localized metadata on important public index pages.
- **Secondary**: `seo_findings` — core technical SEO findings from `scripts/seo-audit.mjs`.
- **Secondary**: `seo_warnings` — non-blocking follow-up prompts from the audit.
- **Secondary**: `check_site_meta_ready` — whether `npx check-site-meta` successfully boots against the configured target URL.

Previous phases:
- **Primary**: `public_metadata_gaps` (count, lower is better) — missing/hardcoded localized metadata on important public index pages.
- **Primary**: `seo_findings` (count, lower is better) — deterministic findings from `scripts/seo-audit.mjs`.

## How to Run
`./autoresearch.sh`

The script outputs `METRIC name=value` lines. It also starts `npx check-site-meta` in non-browser agent mode against `CHECK_SITE_META_TARGET` (default `https://www.gainforest.app`) and terminates it after readiness because the tool is an interactive long-running preview server.

## Files in Scope
- `app/layout.tsx` — root Metadata API, Open Graph/Twitter metadata, locale-aware canonical data, and possible JSON-LD injection.
- `app/page.tsx` — home route metadata and crawlable landing content wrapper.
- `app/_components/HomeLanding.tsx` — crawlable home heading/body text and landing page semantics.
- `app/sitemap.ts` — sitemap entries, priorities, language alternates, and dynamic project URLs.
- `app/robots.ts` — crawler allow/disallow and sitemap hints.
- `messages/*/common.json` and `messages/*.json` — localized SEO and landing-page copy; keep all configured languages in sync.
- `public/og/*`, `public/icons/*` — social preview and icon assets if metadata requires them.
- `scripts/seo-audit.mjs` — benchmark/audit logic; update only when the new signal is genuinely useful and not just to make a change look better.

## Off Limits
- Do not add hardcoded English UI copy. Update translations for any changed user-facing copy.
- Do not expose technical handles, DIDs, or protocol internals in new user-facing SEO copy unless a page truly requires them.
- Do not block public project, organization, observation, or home pages in `robots.ts`.
- Do not introduce a custom SEO service or external runtime dependency just for the audit.

## Constraints
- Preserve existing app behavior for signed-in users, including the home redirect to `/feed`.
- Keep metadata compatible with Next.js Metadata API server components.
- Prefer simple, maintainable technical SEO changes over speculative keyword stuffing.
- Use `npx check-site-meta` as requested, but treat ranking as a long-term outcome that also depends on content, backlinks, Search Console, and deployment.

## What's Been Tried
- Baseline setup: deterministic SEO audit plus `npx check-site-meta` readiness smoke test.
- Reduced `seo_findings` from 8 to 0 by adding localized brand descriptions, root hreflang alternates, and Organization/WebSite JSON-LD with sameAs links.
- Started a second phase for localized public-page metadata: Projects and Observations should use translated Metadata API values and brand-forward descriptions across all configured languages.
- Reduced `public_metadata_gaps` from 12 to 0 by localizing Projects and Observations Metadata API values.
- Started a third phase for public-page `hreflang`: pages with their own `alternates` metadata should preserve localized alternates instead of only setting canonical URLs.
