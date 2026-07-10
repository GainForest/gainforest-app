# Autoresearch: improve GainForest SEO

## Objective
Improve gainforest.app technical SEO and brand/entity signals so Google can better rank GainForest for direct and relevant sustainability searches. A top Google ranking cannot be guaranteed from code alone, so this loop optimizes measurable on-page and metadata factors that support ranking: titles, descriptions, canonicals, hreflang, crawlability, structured data, social previews, and sitemap coverage.

## Metrics
Current phase:
- **Primary**: `project_breadcrumb_gaps` (count, lower is better) — dynamic project detail pages missing BreadcrumbList JSON-LD for search-result hierarchy.
- **Secondary**: `remaining_social_metadata_gaps` — remaining indexable public pages whose social preview metadata still falls back to generic site/home Open Graph/Twitter data.
- **Secondary**: `list_social_metadata_gaps` — public listing pages whose social preview metadata still falls back to generic site/home Open Graph/Twitter data.
- **Secondary**: `list_structured_data_gaps` — public listing pages missing CollectionPage JSON-LD that describes their localized index/list content.
- **Secondary**: `feed_sitemap_gaps` — the public activity feed is indexable with server-rendered content but missing a clear sitemap/noindex strategy.
- **Secondary**: `public_landing_sitemap_gaps` — public landing/setup pages with localized metadata that are missing from sitemap discovery.
- **Secondary**: `indexable_page_hreflang_gaps` — remaining indexable public pages with page-level canonicals but no localized `hreflang` alternates.
- **Secondary**: `seo_findings` — core technical SEO findings from `scripts/seo-audit.mjs`.
- **Secondary**: `localized_static_metadata_gaps` — sitemap-backed public pages with hardcoded English metadata or missing metadata translations.
- **Secondary**: `sitemap_discovery_gaps` — missing sitemap discovery paths for public organization/profile landing pages.
- **Secondary**: `account_profile_metadata_gaps` — missing hreflang/social metadata on public account and organization profile pages.
- **Secondary**: `dynamic_detail_metadata_gaps` — missing hreflang/social metadata on dynamic project detail pages that are included in the sitemap.
- **Secondary**: `public_hreflang_gaps` — public pages whose page-level metadata overrides root metadata without preserving localized `hreflang` alternates.
- **Secondary**: `public_metadata_gaps` — missing/hardcoded localized metadata on important public index pages.
- **Secondary**: `seo_findings` — core technical SEO findings from `scripts/seo-audit.mjs`.
- **Secondary**: `seo_warnings` — non-blocking follow-up prompts from the audit.
- **Secondary**: `check_site_meta_ready` — whether `npx check-site-meta` successfully boots against the configured target URL.

Previous phases:
- **Primary**: `remaining_social_metadata_gaps` (count, lower is better) — remaining indexable public pages whose social preview metadata still falls back to generic site/home Open Graph/Twitter data.
- **Primary**: `list_social_metadata_gaps` (count, lower is better) — public listing pages whose social preview metadata still falls back to generic site/home Open Graph/Twitter data.
- **Primary**: `list_structured_data_gaps` (count, lower is better) — public listing pages missing CollectionPage JSON-LD that describes their localized index/list content.
- **Primary**: `feed_sitemap_gaps` (count, lower is better) — the public activity feed is indexable with server-rendered content but missing a clear sitemap/noindex strategy.
- **Primary**: `public_landing_sitemap_gaps` (count, lower is better) — public landing/setup pages with localized metadata that are missing from sitemap discovery.
- **Primary**: `indexable_page_hreflang_gaps` (count, lower is better) — remaining indexable public pages with page-level canonicals but no localized `hreflang` alternates.
- **Primary**: `seo_findings` (count, lower is better) — core technical SEO findings from `scripts/seo-audit.mjs`.
- **Primary**: `localized_static_metadata_gaps` (count, lower is better) — sitemap-backed public pages with hardcoded English metadata or missing metadata translations.
- **Primary**: `sitemap_discovery_gaps` (count, lower is better) — missing sitemap discovery paths for public organization/profile landing pages.
- **Primary**: `account_profile_metadata_gaps` (count, lower is better) — missing hreflang/social metadata on public account and organization profile pages.
- **Primary**: `dynamic_detail_metadata_gaps` (count, lower is better) — missing hreflang/social metadata on dynamic project detail pages that are included in the sitemap.
- **Primary**: `public_hreflang_gaps` (count, lower is better) — public pages whose page-level metadata overrides root metadata without preserving localized `hreflang` alternates.
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
- Reduced `public_hreflang_gaps` from 10 to 0 by adding a shared `localizedAlternates` helper and applying it to sitemap-backed public pages.
- Started a fourth phase for dynamic project detail metadata: sitemap-backed project detail pages should preserve localized alternates and include canonical Open Graph/Twitter preview metadata.
- Reduced `dynamic_detail_metadata_gaps` from 3 to 0 by adding localized alternates plus Open Graph/Twitter metadata to project detail pages.
- Started a fifth phase for public account/profile metadata: organization and user profiles are linked throughout the app and should preserve localized alternates plus social preview metadata.
- Reduced `account_profile_metadata_gaps` from 3 to 0 by adding localized alternates plus Open Graph/Twitter metadata to public account/profile pages.
- Started a sixth phase for sitemap discovery: public certified organization profiles should be discoverable in the sitemap, not only through client/internal links.
- Reduced `sitemap_discovery_gaps` from 2 to 0 by adding best-effort certified organization profile entries to the sitemap.
- Started a seventh phase for localized static metadata: sitemap-backed pages like home, devices, and status should not serve hardcoded English titles/descriptions on localized URLs.
- Reduced `localized_static_metadata_gaps` from 13 to 0 by converting home/devices/status to translated `generateMetadata` and adding devices/status metadata translations.
- Started an audit-alignment phase after localization: the core SEO audit must recognize translated home metadata from `common.seo` instead of expecting hardcoded English in `app/page.tsx`.
- Restored `seo_findings` to 0 by aligning the audit with localized home Metadata API usage.
- Started an eighth phase for remaining indexable page `hreflang`: public pages such as feed, submit-data, and Tainá use page-level canonicals and should preserve localized alternates unless explicitly noindexed.
- Reduced `indexable_page_hreflang_gaps` from 3 to 0 by switching feed, submit-data, and Tainá to `localizedAlternates`.
- Started a ninth phase for public landing-page sitemap discovery: `/submit-data` and `/taina` have localized metadata and should be discoverable through `sitemap.xml` if they remain indexable public landing/setup pages.
- Reduced `public_landing_sitemap_gaps` from 2 to 0 by adding `/submit-data` and `/taina` to sitemap routes.
- Started a tenth phase for `/feed`: it is an indexable, server-rendered public activity page with localized metadata and should either be listed in sitemap.xml or explicitly noindexed. The current hypothesis is that listing it is better because it exposes fresh public activity and internal links.
- Reduced `feed_sitemap_gaps` from 1 to 0 by adding `/feed` to the sitemap with daily change frequency.
- Started an eleventh phase for list-page structured data: public listing pages (`/projects`, `/observations`, `/organizations`) should emit localized `CollectionPage` JSON-LD in addition to regular metadata, so crawlers can understand these as index/list pages rather than generic web pages.
- Reduced `list_structured_data_gaps` from 3 to 0 by adding localized `CollectionPage` JSON-LD to `/projects`, `/observations`, and `/organizations`.
- Started a twelfth phase for list-page social metadata: the same high-value list pages should define page-specific Open Graph/Twitter metadata so check-site-meta/social previews show the list page title/description rather than generic home metadata.
- Reduced `list_social_metadata_gaps` from 3 to 0 by adding page-specific Open Graph/Twitter metadata to `/projects`, `/observations`, and `/organizations`.
- Started a thirteenth phase for remaining social metadata: other indexable public pages (`/feed`, `/submit-data`, `/taina`, `/devices`, `/status`) should also use page-specific social preview metadata because they now have localized metadata and sitemap/hreflang coverage.
- Reduced `remaining_social_metadata_gaps` from 5 to 0 by adding a reusable `socialPreviewMetadata` helper and applying it to `/feed`, `/submit-data`, `/taina`, `/devices`, and `/status`.
- Started a fourteenth phase for project breadcrumbs: dynamic project detail pages are high-value sitemap-backed landing pages and should emit `BreadcrumbList` JSON-LD for home → projects → project hierarchy.
