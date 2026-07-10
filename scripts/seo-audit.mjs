#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const findings = [];
const pageMetadataGaps = [];
const publicHreflangGaps = [];
const dynamicDetailMetadataGaps = [];
const accountProfileMetadataGaps = [];
const sitemapDiscoveryGaps = [];
const localizedStaticMetadataGaps = [];
const indexablePageHreflangGaps = [];
const publicLandingSitemapGaps = [];
const feedSitemapGaps = [];
const listStructuredDataGaps = [];
const listSocialMetadataGaps = [];
const remainingSocialMetadataGaps = [];
const projectBreadcrumbGaps = [];
const accountProfileStructuredDataGaps = [];
const observationsServerContentGaps = [];
const projectsServerContentGaps = [];
const organizationsServerContentGaps = [];
const listItemStructuredDataGaps = [];
const warnings = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function addFinding(id, detail) {
  findings.push({ id, detail });
}

function addWarning(id, detail) {
  warnings.push({ id, detail });
}

function addPageMetadataGap(id, detail) {
  pageMetadataGaps.push({ id, detail });
}

function addPublicHreflangGap(id, detail) {
  publicHreflangGaps.push({ id, detail });
}

function addDynamicDetailMetadataGap(id, detail) {
  dynamicDetailMetadataGaps.push({ id, detail });
}

function addAccountProfileMetadataGap(id, detail) {
  accountProfileMetadataGaps.push({ id, detail });
}

function addSitemapDiscoveryGap(id, detail) {
  sitemapDiscoveryGaps.push({ id, detail });
}

function addLocalizedStaticMetadataGap(id, detail) {
  localizedStaticMetadataGaps.push({ id, detail });
}

function addIndexablePageHreflangGap(id, detail) {
  indexablePageHreflangGaps.push({ id, detail });
}

function addPublicLandingSitemapGap(id, detail) {
  publicLandingSitemapGaps.push({ id, detail });
}

function addFeedSitemapGap(id, detail) {
  feedSitemapGaps.push({ id, detail });
}

function addListStructuredDataGap(id, detail) {
  listStructuredDataGaps.push({ id, detail });
}

function addListSocialMetadataGap(id, detail) {
  listSocialMetadataGaps.push({ id, detail });
}

function addRemainingSocialMetadataGap(id, detail) {
  remainingSocialMetadataGaps.push({ id, detail });
}

function addProjectBreadcrumbGap(id, detail) {
  projectBreadcrumbGaps.push({ id, detail });
}

function addAccountProfileStructuredDataGap(id, detail) {
  accountProfileStructuredDataGaps.push({ id, detail });
}

function addObservationsServerContentGap(id, detail) {
  observationsServerContentGaps.push({ id, detail });
}

function addProjectsServerContentGap(id, detail) {
  projectsServerContentGaps.push({ id, detail });
}

function addOrganizationsServerContentGap(id, detail) {
  organizationsServerContentGaps.push({ id, detail });
}

function addListItemStructuredDataGap(id, detail) {
  listItemStructuredDataGaps.push({ id, detail });
}

const locales = ["en", "es", "pt", "sw", "id"];
const layout = read("app/layout.tsx");
const page = read("app/page.tsx");
const devicesPage = read("app/devices/page.tsx");
const statusPage = read("app/status/page.tsx");
const indexablePagesNeedingLocalizedAlternates = [
  { path: "/feed", file: "app/feed/page.tsx" },
  { path: "/submit-data", file: "app/submit-data/page.tsx" },
  { path: "/taina", file: "app/taina/page.tsx" },
];
const publicLandingPagesNeedingSitemap = [
  { path: "/submit-data", reason: "field-partner data submission landing page" },
  { path: "/taina", reason: "Tainá field assistant setup landing page" },
];
const indexablePagesNeedingSocialMetadata = [
  { path: "/feed", file: "app/feed/page.tsx" },
  { path: "/submit-data", file: "app/submit-data/page.tsx" },
  { path: "/taina", file: "app/taina/page.tsx" },
  { path: "/devices", file: "app/devices/page.tsx" },
  { path: "/status", file: "app/status/page.tsx" },
];
const sitemap = read("app/sitemap.ts");
const robots = read("app/robots.ts");
const homeLanding = read("app/_components/HomeLanding.tsx");
const projectsPage = read("app/projects/page.tsx");
const observationsPage = read("app/observations/page.tsx");
const organizationsPage = read("app/organizations/page.tsx");
const projectDetailPage = read("app/projects/[did]/[rkey]/page.tsx");
const accountLayout = read("app/account/[did]/layout.tsx");
const publicPagesNeedingHreflang = [
  { path: "/", file: "app/page.tsx" },
  { path: "/observations", file: "app/observations/page.tsx" },
  { path: "/projects", file: "app/projects/page.tsx" },
  { path: "/organizations", file: "app/organizations/page.tsx" },
  { path: "/bioblitz", file: "app/bioblitz/page.tsx" },
  { path: "/grants", file: "app/grants/page.tsx" },
  { path: "/devices", file: "app/devices/page.tsx" },
  { path: "/status", file: "app/status/page.tsx" },
  { path: "/privacy", file: "app/privacy/page.tsx" },
  { path: "/docs/lexicons", file: "app/docs/lexicons/page.tsx" },
];

for (const locale of locales) {
  const common = readJson(`messages/${locale}/common.json`);
  const marketplace = readJson(`messages/${locale}/marketplace.json`);
  const seo = common.seo ?? {};
  const title = String(seo.title ?? "");
  const description = String(seo.description ?? "");

  if (!title.includes("GainForest")) {
    addFinding(`seo-title-brand-${locale}`, `${locale} root SEO title should include GainForest.`);
  }
  if (title.length < 20 || title.length > 65) {
    addFinding(`seo-title-length-${locale}`, `${locale} root SEO title length is ${title.length}; target 20–65 characters.`);
  }
  if (!description.includes("GainForest")) {
    addFinding(`seo-description-brand-${locale}`, `${locale} root SEO description should name GainForest, not only a generic product.`);
  }
  if (description.length < 80 || description.length > 170) {
    addFinding(`seo-description-length-${locale}`, `${locale} root SEO description length is ${description.length}; target 80–170 characters.`);
  }

  const projectsMetadata = marketplace.projects?.metadata;
  if (!projectsMetadata?.title || !projectsMetadata?.description) {
    addPageMetadataGap(`projects-metadata-${locale}`, `${locale} projects metadata translation is missing.`);
  } else if (!String(projectsMetadata.description).includes("GainForest")) {
    addPageMetadataGap(`projects-metadata-brand-${locale}`, `${locale} projects metadata description should name GainForest.`);
  }

  const observationsMetadata = marketplace.observations?.metadata;
  if (!observationsMetadata?.title || !observationsMetadata?.description) {
    addPageMetadataGap(`observations-metadata-${locale}`, `${locale} observations metadata translation is missing.`);
  } else if (!String(observationsMetadata.description).includes("GainForest")) {
    addPageMetadataGap(`observations-metadata-brand-${locale}`, `${locale} observations metadata description should name GainForest.`);
  }
}

if (!layout.includes("applicationName: SITE_NAME")) {
  addFinding("metadata-application-name", "Root metadata should set applicationName for app/search result context.");
}
if (!/alternates:\s*\{[\s\S]*languages/.test(layout)) {
  addFinding("metadata-hreflang", "Root metadata should expose language alternates so Google can cluster localized home pages.");
}
if (!layout.includes("@type") || !layout.includes("Organization") || !layout.includes("WebSite")) {
  addFinding("jsonld-home-organization-website", "Home page should include Organization and WebSite JSON-LD for brand/entity understanding.");
}
if (!layout.includes("sameAs")) {
  addFinding("jsonld-brand-sameas", "Organization JSON-LD should include sameAs links to connect GainForest's web entities.");
}

for (const { path, file } of publicPagesNeedingHreflang) {
  const source = read(file);
  if (!source.includes("localizedAlternates") || !source.includes(`localizedAlternates(\"${path}\")`)) {
    addPublicHreflangGap(
      `hreflang-${path === "/" ? "home" : path.slice(1).replaceAll("/", "-")}`,
      `${file} should use localizedAlternates(\"${path}\") so localized public URLs keep hreflang alternates when page metadata overrides root metadata.`,
    );
  }
}

if (!projectDetailPage.includes("localizedAlternates(localProjectHref(urlIdentifier, rkey))")) {
  addDynamicDetailMetadataGap(
    "project-detail-hreflang",
    "Dynamic project detail metadata should use localizedAlternates(localProjectHref(urlIdentifier, rkey)) so indexed project pages expose language alternates.",
  );
}
if (!projectDetailPage.includes("openGraph:") || !projectDetailPage.includes("url: detailHref")) {
  addDynamicDetailMetadataGap(
    "project-detail-og-url",
    "Dynamic project detail Open Graph metadata should include the canonical detail URL for consistent social/link previews.",
  );
}
if (!projectDetailPage.includes("twitter:") || !projectDetailPage.includes("summary_large_image")) {
  addDynamicDetailMetadataGap(
    "project-detail-twitter-card",
    "Dynamic project detail metadata should define a Twitter/X card using the project title, description, and image.",
  );
}
if (!projectDetailPage.includes("BreadcrumbList") || !projectDetailPage.includes("buildProjectBreadcrumbJsonLd") || !projectDetailPage.includes("project-breadcrumb-json-ld")) {
  addProjectBreadcrumbGap(
    "project-detail-breadcrumb-jsonld",
    "Dynamic project detail pages should emit BreadcrumbList JSON-LD (home → projects → project) so search results can understand hierarchy and breadcrumbs.",
  );
}

for (const { id, file, source, translationKey } of [
  { id: "home", file: "app/page.tsx", source: page, translationKey: "common.seo" },
  { id: "devices", file: "app/devices/page.tsx", source: devicesPage, translationKey: "common.devices.metadata" },
  { id: "status", file: "app/status/page.tsx", source: statusPage, translationKey: "common.status.metadata" },
]) {
  if (!source.includes("generateMetadata") || !source.includes("getTranslations") || !source.includes(translationKey)) {
    addLocalizedStaticMetadataGap(
      `localized-static-metadata-${id}`,
      `${file} should use generateMetadata with ${translationKey} translations so localized URLs do not serve hardcoded English metadata.`,
    );
  }
}
for (const locale of locales) {
  const common = readJson(`messages/${locale}/common.json`);
  if (!common.devices?.metadata?.title || !common.devices?.metadata?.description) {
    addLocalizedStaticMetadataGap(`devices-metadata-${locale}`, `${locale} devices metadata translation is missing.`);
  }
  if (!common.status?.metadata?.title || !common.status?.metadata?.description) {
    addLocalizedStaticMetadataGap(`status-metadata-${locale}`, `${locale} status metadata translation is missing.`);
  }
}

for (const { path, file } of indexablePagesNeedingLocalizedAlternates) {
  const source = read(file);
  const isNoindex = /robots:\s*\{[^}]*index:\s*false/s.test(source);
  if (!isNoindex && (!source.includes("localizedAlternates") || !source.includes(`localizedAlternates(\"${path}\")`))) {
    addIndexablePageHreflangGap(
      `indexable-hreflang-${path.slice(1).replaceAll("-", "_")}`,
      `${file} is an indexable localized page with page-level canonical metadata; it should use localizedAlternates(\"${path}\") to preserve hreflang alternates.`,
    );
  }
}

for (const { path, reason } of publicLandingPagesNeedingSitemap) {
  if (!sitemap.includes(`path: "${path}"`)) {
    addPublicLandingSitemapGap(
      `sitemap-public-landing-${path.slice(1).replaceAll("-", "_")}`,
      `${path} is a public ${reason} with localized metadata and should appear in sitemap.xml for crawler discovery.`,
    );
  }
}

const feedPage = read("app/feed/page.tsx");
const feedIsIndexable = !/robots:\s*\{[^}]*index:\s*false/s.test(feedPage);
if (feedIsIndexable && !sitemap.includes('path: "/feed"')) {
  addFeedSitemapGap(
    "sitemap-feed",
    "/feed is an indexable, server-rendered public activity page with localized metadata and should be either listed in sitemap.xml or explicitly noindexed.",
  );
}

for (const { id, file, source, path } of [
  { id: "projects", file: "app/projects/page.tsx", source: projectsPage, path: "/projects" },
  { id: "observations", file: "app/observations/page.tsx", source: observationsPage, path: "/observations" },
  { id: "organizations", file: "app/organizations/page.tsx", source: organizationsPage, path: "/organizations" },
]) {
  if (!source.includes("application/ld+json") || !source.includes("CollectionPage") || !source.includes(path)) {
    addListStructuredDataGap(
      `list-structured-data-${id}`,
      `${file} should emit CollectionPage JSON-LD using its localized metadata and canonical ${path} URL so crawlers understand the public listing page type.`,
    );
  }
  if (!source.includes("openGraph:") || !source.includes("twitter:") || !source.includes(`url: \"${path}\"`)) {
    addListSocialMetadataGap(
      `list-social-metadata-${id}`,
      `${file} should set page-specific Open Graph and Twitter metadata with canonical ${path} URL so check-site-meta/social previews do not fall back to generic home metadata.`,
    );
  }
}

if (!observationsPage.includes("walkOccurrences") || !observationsPage.includes("initialPage={initialPage}")) {
  addObservationsServerContentGap(
    "observations-initial-server-page",
    "/observations should fetch and pass an initial server-rendered page of public sightings so crawlers and no-JS previews see real observation cards and links, not only an empty client shell.",
  );
}
if (!projectsPage.includes("fetchProjects") || !projectsPage.includes("initialPage={initialPage}")) {
  addProjectsServerContentGap(
    "projects-initial-server-page",
    "/projects should fetch and pass an initial server-rendered page of public project cards so crawlers and no-JS previews see real project links, not only an empty client shell.",
  );
}
if (!organizationsPage.includes("fetchSites") || !organizationsPage.includes("initialPage={initialPage}")) {
  addOrganizationsServerContentGap(
    "organizations-initial-server-page",
    "/organizations should fetch and pass an initial server-rendered page of public organization cards so crawlers and no-JS previews see real organization profile links, not only an empty client shell.",
  );
}
for (const { id, file, source } of [
  { id: "projects", file: "app/projects/page.tsx", source: projectsPage },
  { id: "observations", file: "app/observations/page.tsx", source: observationsPage },
  { id: "organizations", file: "app/organizations/page.tsx", source: organizationsPage },
]) {
  if (!source.includes("ItemList") || !source.includes("itemListElement") || !source.includes(`${id}-item-list-json-ld`)) {
    addListItemStructuredDataGap(
      `list-item-structured-data-${id}`,
      `${file} should emit ItemList JSON-LD for its server-rendered initial records so crawlers can connect the public listing page to the visible project/observation/organization cards.`,
    );
  }
}

for (const { path, file } of indexablePagesNeedingSocialMetadata) {
  const source = read(file);
  const isNoindex = /robots:\s*\{[^}]*index:\s*false/s.test(source);
  if (!isNoindex && !source.includes(`socialPreviewMetadata(\"${path}\"`)) {
    addRemainingSocialMetadataGap(
      `remaining-social-metadata-${path.slice(1).replaceAll("-", "_")}`,
      `${file} is an indexable public page with localized metadata; it should use socialPreviewMetadata(\"${path}\", ...) so check-site-meta/social previews are page-specific.`,
    );
  }
}

if (!sitemap.includes("fetchOrganizationEntries") || !sitemap.includes("/account/${encodeURIComponent(node.did)}")) {
  addSitemapDiscoveryGap(
    "organization-profile-sitemap",
    "Sitemap should include public organization profile pages from app.certified.actor.organization so crawlers can discover organization landing pages alongside projects.",
  );
}
if (!sitemap.includes("appCertifiedActorOrganization")) {
  addSitemapDiscoveryGap(
    "organization-profile-query",
    "Sitemap should query certified organization records to discover public organization profile URLs.",
  );
}

if (!accountLayout.includes("localizedAlternates(`/account/${encodeURIComponent(account.urlIdentifier)}`)")) {
  addAccountProfileMetadataGap(
    "account-profile-hreflang",
    "Public account/profile metadata should use localizedAlternates for the canonical account path so organization profiles preserve language alternates.",
  );
}
if (!accountLayout.includes("openGraph:") || !accountLayout.includes("url: accountHref")) {
  addAccountProfileMetadataGap(
    "account-profile-og-url",
    "Public account/profile Open Graph metadata should include the canonical account URL for consistent previews.",
  );
}
if (!accountLayout.includes("twitter:") || !accountLayout.includes("summary")) {
  addAccountProfileMetadataGap(
    "account-profile-twitter-card",
    "Public account/profile metadata should define a Twitter/X summary card using the account name, description, and avatar when available.",
  );
}
if (!accountLayout.includes("ProfilePage") || !accountLayout.includes("buildAccountProfileJsonLd") || !accountLayout.includes("account-profile-json-ld")) {
  addAccountProfileStructuredDataGap(
    "account-profile-jsonld",
    "Public account/profile pages should emit ProfilePage JSON-LD with Person/Organization mainEntity data so search engines understand profile entities beyond generic page metadata.",
  );
}

if (!projectsPage.includes("generateMetadata") || !projectsPage.includes("getTranslations")) {
  addPageMetadataGap("projects-page-localized-metadata", "Projects page should use localized metadata from messages, not hardcoded English.");
}
if (!observationsPage.includes("generateMetadata") || !observationsPage.includes("getTranslations")) {
  addPageMetadataGap("observations-page-localized-metadata", "Observations page should use localized metadata from messages, not hardcoded English.");
}

if (!page.includes("getTranslations(\"common.seo\")")) {
  addFinding("home-metadata-description-brand", "Home page metadata should use the localized common.seo brand description.");
}
if (!page.includes("getTranslations(\"common.seo\")")) {
  addFinding("home-metadata-title-brand", "Home page metadata should use the localized common.seo brand title.");
}
if (!/<h1\b/.test(homeLanding)) {
  addFinding("home-h1", "Home landing page should render exactly one crawlable h1.");
}
if (!homeLanding.includes("headingUnderlined") || !homeLanding.includes("headingRest")) {
  addFinding("home-heading-translated", "Home h1 should use translated text rather than hardcoded English.");
}

for (const image of [
  "public/og/gainforest-og-2.png",
  "public/icons/favicon.ico",
  "public/icons/apple-touch-icon.png",
]) {
  if (!existsSync(join(root, image))) {
    addFinding(`asset-${image}`, `${image} should exist for search/social previews.`);
  }
}

for (const route of ["", "/observations", "/projects", "/organizations", "/bioblitz", "/grants", "/privacy"]) {
  const quoted = route === "" ? 'path: ""' : `path: "${route}"`;
  if (!sitemap.includes(quoted)) {
    addFinding(`sitemap-route-${route || "home"}`, `Sitemap should include ${route || "/"}.`);
  }
}
if (!sitemap.includes("alternates") || !sitemap.includes("languages")) {
  addFinding("sitemap-hreflang", "Sitemap entries should include language alternates.");
}
if (!robots.includes("sitemap")) {
  addFinding("robots-sitemap", "robots.txt should point crawlers to sitemap.xml.");
}
if (!robots.includes('allow: "/"')) {
  addFinding("robots-allow-root", "robots.txt should explicitly allow the public site.");
}
if (robots.includes("/projects") || robots.includes("/observations")) {
  addFinding("robots-public-disallow", "robots.txt must not disallow public project or observation pages.");
}

if (!layout.includes("twitter:") || !layout.includes("summary_large_image")) {
  addFinding("twitter-card", "Root metadata should define a large-image Twitter/X card.");
}
if (!layout.includes("openGraph:") || !layout.includes("images:")) {
  addFinding("open-graph-image", "Root metadata should define Open Graph preview image metadata.");
}
if (!layout.includes("metadataBase")) {
  addFinding("metadata-base", "Root metadata should set metadataBase so relative canonicals and preview images become absolute URLs.");
}

if (findings.length === 0) {
  addWarning("next-step", "Technical SEO audit is clean; next experiments should target content depth, internal links, and live Search Console data.");
}

console.log("SEO audit findings:");
for (const finding of findings) {
  console.log(`- ${finding.id}: ${finding.detail}`);
}
console.log("Public page metadata gaps:");
for (const gap of pageMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Public hreflang gaps:");
for (const gap of publicHreflangGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Dynamic detail metadata gaps:");
for (const gap of dynamicDetailMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Account profile metadata gaps:");
for (const gap of accountProfileMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Sitemap discovery gaps:");
for (const gap of sitemapDiscoveryGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Localized static metadata gaps:");
for (const gap of localizedStaticMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Indexable page hreflang gaps:");
for (const gap of indexablePageHreflangGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Public landing sitemap gaps:");
for (const gap of publicLandingSitemapGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Feed sitemap gaps:");
for (const gap of feedSitemapGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("List structured data gaps:");
for (const gap of listStructuredDataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("List social metadata gaps:");
for (const gap of listSocialMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Remaining social metadata gaps:");
for (const gap of remainingSocialMetadataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Project breadcrumb gaps:");
for (const gap of projectBreadcrumbGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Account profile structured data gaps:");
for (const gap of accountProfileStructuredDataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Observations server-rendered content gaps:");
for (const gap of observationsServerContentGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Projects server-rendered content gaps:");
for (const gap of projectsServerContentGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("Organizations server-rendered content gaps:");
for (const gap of organizationsServerContentGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
console.log("List ItemList structured data gaps:");
for (const gap of listItemStructuredDataGaps) {
  console.log(`- ${gap.id}: ${gap.detail}`);
}
for (const warning of warnings) {
  console.log(`WARN ${warning.id}: ${warning.detail}`);
}
console.log(`METRIC seo_findings=${findings.length}`);
console.log(`METRIC public_metadata_gaps=${pageMetadataGaps.length}`);
console.log(`METRIC public_hreflang_gaps=${publicHreflangGaps.length}`);
console.log(`METRIC dynamic_detail_metadata_gaps=${dynamicDetailMetadataGaps.length}`);
console.log(`METRIC account_profile_metadata_gaps=${accountProfileMetadataGaps.length}`);
console.log(`METRIC sitemap_discovery_gaps=${sitemapDiscoveryGaps.length}`);
console.log(`METRIC localized_static_metadata_gaps=${localizedStaticMetadataGaps.length}`);
console.log(`METRIC indexable_page_hreflang_gaps=${indexablePageHreflangGaps.length}`);
console.log(`METRIC public_landing_sitemap_gaps=${publicLandingSitemapGaps.length}`);
console.log(`METRIC feed_sitemap_gaps=${feedSitemapGaps.length}`);
console.log(`METRIC list_structured_data_gaps=${listStructuredDataGaps.length}`);
console.log(`METRIC list_social_metadata_gaps=${listSocialMetadataGaps.length}`);
console.log(`METRIC remaining_social_metadata_gaps=${remainingSocialMetadataGaps.length}`);
console.log(`METRIC project_breadcrumb_gaps=${projectBreadcrumbGaps.length}`);
console.log(`METRIC account_profile_structured_data_gaps=${accountProfileStructuredDataGaps.length}`);
console.log(`METRIC observations_server_content_gaps=${observationsServerContentGaps.length}`);
console.log(`METRIC projects_server_content_gaps=${projectsServerContentGaps.length}`);
console.log(`METRIC organizations_server_content_gaps=${organizationsServerContentGaps.length}`);
console.log(`METRIC list_item_structured_data_gaps=${listItemStructuredDataGaps.length}`);
console.log(`METRIC seo_warnings=${warnings.length}`);
