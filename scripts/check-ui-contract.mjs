#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const sourceFiles = (directory) =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(entry.name) === ".tsx" ? [path] : [];
  });
const openingTags = (source, componentName) => {
  const tags = [];
  const needle = `<${componentName}`;
  let start = source.indexOf(needle);

  while (start !== -1) {
    const characterAfterName = source[start + needle.length];
    if (characterAfterName && /[\w$]/.test(characterAfterName)) {
      start = source.indexOf(needle, start + needle.length);
      continue;
    }

    let braceDepth = 0;
    let quote = null;
    let escaped = false;

    for (let index = start + needle.length; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") quote = character;
      else if (character === "{") braceDepth += 1;
      else if (character === "}") braceDepth -= 1;
      else if (character === ">" && braceDepth === 0) {
        tags.push(source.slice(start, index + 1));
        break;
      }
    }

    start = source.indexOf(needle, start + needle.length);
  }

  return tags;
};
const jsxAttributeValue = (tag, attributeName) => {
  const match = new RegExp(`\\b${attributeName}\\s*=`).exec(tag);
  if (!match) return null;
  let index = match.index + match[0].length;
  while (/\s/.test(tag[index] ?? "")) index += 1;
  const opener = tag[index];

  if (opener === '"' || opener === "'" || opener === "`") {
    let escaped = false;
    for (let end = index + 1; end < tag.length; end += 1) {
      if (escaped) escaped = false;
      else if (tag[end] === "\\") escaped = true;
      else if (tag[end] === opener) return tag.slice(index, end + 1);
    }
    return null;
  }

  if (opener === "{") {
    let depth = 1;
    let quote = null;
    let escaped = false;
    for (let end = index + 1; end < tag.length; end += 1) {
      const character = tag[end];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") quote = character;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return tag.slice(index, end + 1);
      }
    }
  }

  return null;
};
const guaranteedClassTokens = (tag) => {
  const className = jsxAttributeValue(tag, "className");
  if (!className) return new Set();
  if (className[0] !== "{") {
    return new Set(className.slice(1, -1).split(/\s+/));
  }

  const tokens = new Set();
  for (const literal of className.matchAll(/(["'`])([^"'`]*)\1/g)) {
    const prefix = className.slice(0, literal.index).trimEnd();
    if (prefix.endsWith("&&") || prefix.endsWith("?") || prefix.endsWith(":")) continue;
    for (const token of literal[2].split(/\s+/)) tokens.add(token);
  }
  return tokens;
};
const headingUsesDisplayTypography = (tag, { allowLocalInstrument = false } = {}) => {
  const classTokens = guaranteedClassTokens(tag);
  const usesInstrument =
    classTokens.has("font-instrument") ||
    /fontFamily\s*:\s*["'][^"']*var\(--font-instrument-serif-var\)/.test(tag) ||
    (allowLocalInstrument && /fontFamily\s*:\s*instrument\.style\.fontFamily/.test(tag));
  const usesItalic =
    classTokens.has("italic") ||
    /fontStyle\s*:\s*["']italic["']/.test(tag);
  return usesInstrument && usesItalic;
};
const lineNumber = (source, fragment) => source.slice(0, source.indexOf(fragment)).split("\n").length;
const landingFiles = new Set([
  "app/page.tsx",
  "app/_components/HomeLanding.tsx",
  "app/_components/BrowseGrid.tsx",
]);
const productionTsxFiles = [...sourceFiles("app"), ...sourceFiles("components")].filter(
  (path) =>
    !landingFiles.has(path) &&
    !path.startsWith("app/%5Ftest/") &&
    !path.startsWith("app/_test/"),
);
const productionRuntimeTsxFiles = productionTsxFiles.filter(
  (path) => !path.endsWith(".test.tsx"),
);
const garamondAllowedFiles = new Set([
  ...landingFiles,
  "app/layout.tsx",
  "components/ui/typography.tsx",
]);
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

// Regression fixtures keep the source guard honest across multiline strings,
// cn() expressions, inline emergency styles, and misleading `not-italic` text.
assert(
  headingUsesDisplayTypography(`<h2 className={cn(
    "font-instrument",
    "text-xl italic",
    active && "text-primary",
  )}>`),
  "checker regression: multiline cn() headings must be recognized",
);
assert(
  !headingUsesDisplayTypography('<h2 className={active && "font-instrument italic"}>'),
  "checker regression: conditional typography must not produce a false green",
);
assert(
  headingUsesDisplayTypography(`<h1 style={{
    fontFamily: "var(--font-instrument-serif-var), Georgia, serif",
    fontStyle: "italic",
  }}>`),
  "checker regression: inline Instrument headings must be recognized",
);
assert(
  !headingUsesDisplayTypography('<h3 className="font-instrument not-italic">'),
  "checker regression: not-italic must not satisfy the italic contract",
);
assert(
  !headingUsesDisplayTypography('<h4 className="italic">'),
  "checker regression: italic without Instrument must fail",
);

const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
const globalError = read("app/global-error.tsx");
const motionProvider = read("components/providers/MotionProvider.tsx");
const button = read("components/ui/button.tsx");
const pictureHero = read("app/_components/PictureHero.tsx");
const emptyHeroBanner = read("app/_components/EmptyHeroBanner.tsx");
const gracefulNotFound = read("app/_components/GracefulNotFound.tsx");
const sectionSurface = read("components/ui/section-surface.tsx");
const typography = read("components/ui/typography.tsx");
const container = read("components/ui/container.tsx");
const dialog = read("components/ui/modal/dialog.tsx");
const drawer = read("components/ui/modal/drawer.tsx");
const modal = read("components/ui/modal/modal.tsx");
const sidebar = read("app/_components/shell/UnifiedSidebar.tsx");
const shellHeader = read("app/_components/shell/ShellHeader.tsx");
const shellHeaderControl = read("app/_components/shell/control-recipes.ts");
const globalSearch = read("app/_components/GlobalSearch.tsx");
const notificationBell = read("app/_components/NotificationBell.tsx");
const cartHeaderButton = read("app/_components/cart/CartHeaderButton.tsx");
const authFlow = read("app/_components/AuthFlow.tsx");
const floatingTaina = read("app/_components/FloatingTainaGuide.tsx");
const accountChrome = read("app/account/_components/AccountChrome.tsx");
const accountAudio = read("app/account/[did]/audio/AccountAudioViewer.tsx");
const projectsExplore = read("app/projects/ProjectsExploreClient.tsx");
const organizationsExplore = read("app/organizations/OrganizationsClient.tsx");
const recordExplorer = read("app/_components/RecordExplorer.tsx");
const pageLoadingSkeletons = read("app/_components/PageLoadingSkeletons.tsx");
const accountSettings = read("app/account/_components/AccountSettingsSections.tsx");
const manageSections = read("app/(manage)/manage/_sections.tsx");

assert(
  /--font-serif:\s*var\(--font-geist-sans\)/.test(globals),
  "app/globals.css: the generic serif token must resolve to Geist",
);
assert(
  /\.font-brand-word\s*{[^}]*var\(--font-garamond-var\)/s.test(globals),
  "app/globals.css: BrandWord must retain the Garamond next/font token",
);
for (const token of ["geistSans.variable", "geistMono.variable", "cormorant.variable", "instrument.variable"]) {
  assert(layout.includes(token), `app/layout.tsx: body must mount the ${token} next/font token`);
}
assert(
  /Instrument_Serif\s*\([\s\S]*?style:\s*"italic"/.test(globalError),
  "app/global-error.tsx: the root fallback must load its own italic Instrument font",
);
assert(
  (globals.match(/@keyframes\s+shimmer\b/g) ?? []).length === 1,
  "app/globals.css: shimmer must have one canonical keyframe definition",
);
assert(
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?body\s*{\s*transition:\s*none;/.test(globals),
  "app/globals.css: body transitions must be disabled for reduced motion",
);
assert(
  /<MotionProvider>[\s\S]*?<\/MotionProvider>/.test(layout),
  "app/layout.tsx: MotionProvider must wrap the application provider tree",
);
assert(
  /<MotionConfig\s+reducedMotion="user">/.test(motionProvider),
  'MotionProvider must mount MotionConfig reducedMotion="user"',
);
assert(
  /whileTap={shouldReduceMotion \? undefined :/.test(button),
  "Button must suppress tap motion when the viewer requests reduced motion",
);
for (const path of [
  "components/ui/accordion.tsx",
  "components/ui/modal/dialog.tsx",
  "components/ui/modal/drawer.tsx",
  "components/ui/popover.tsx",
]) {
  assert(
    /motion-reduce:(?:animate-none|transition-none)/.test(read(path)),
    `${path}: animated shared primitives need a reduced-motion variant`,
  );
}

assert(!/\beyebrow\b/.test(pictureHero), "PictureHero must not expose an eyebrow API");
assert(!/^\s*icon\??:/m.test(pictureHero), "PictureHero must not expose an icon API");
assert(/imageAlt:\s*string/.test(pictureHero), "PictureHero imageAlt must be caller-owned and required");
assert(/role={imageAlt \? "img"/.test(pictureHero), "PictureHero must expose supplied image alt text once on its artwork wrapper");
assert((pictureHero.match(/<Image[\s\S]*?alt=""/g) ?? []).length === 2, "PictureHero theme-specific images must remain decorative");
assert(/<DisplayHeading[\s\S]*?as="h1"/.test(pictureHero), "PictureHero must use a semantic DisplayHeading");
assert(!/font-(?:serif|garamond)|--font-garamond-var/.test(pictureHero), "PictureHero must not use a generic Garamond escape path");

assert(!/\beyebrow\b/.test(gracefulNotFound), "GracefulNotFound must not expose or render an eyebrow");
assert(/<DisplayHeading[\s\S]*?as="h1"/.test(gracefulNotFound), "GracefulNotFound must use a semantic DisplayHeading");
assert(/variant="muted"/.test(emptyHeroBanner), "EmptyHeroBanner must use the shared muted surface");
assert(!/\bborder\b[^\n]*\bshadow/.test(emptyHeroBanner), "EmptyHeroBanner must remain a borderless shared state");
assert(/motion-reduce:animate-none/.test(emptyHeroBanner), "EmptyHeroBanner entrance must respect reduced motion");
assert(/aria-describedby=/.test(emptyHeroBanner), "EmptyHeroBanner must associate visible disabled-action explanations");

for (const variant of ["plain", "muted", "danger", "elevated"]) {
  assert(new RegExp(`\\b${variant}:`).test(sectionSurface), `SectionSurface must expose the ${variant} variant`);
}
assert(!/\b(?:default|card|outlined|glass):/.test(sectionSurface), "SectionSurface must keep its variant API narrow");
assert(
  /muted:\s*"rounded-2xl bg-muted p-4 sm:p-5"/.test(sectionSurface),
  "SectionSurface muted regions must use the compact surface-padding recipe",
);

// Shared layout recipes own width, responsive page gutters, and ordinary
// surface geometry. These exact primitives prevent route-by-route drift.
for (const [family, className] of [
  ["reading", "max-w-3xl"],
  ["standard", "max-w-6xl"],
  ["wide", "max-w-[90rem]"],
  ["full", "max-w-none"],
]) {
  assert(
    container.includes(`${family}: "${className}"`),
    `Container must expose the ${family} width family`,
  );
}
assert(
  /true:\s*"px-3 sm:px-5 lg:px-8"/.test(container),
  "Container must own the 12/20/32px responsive page gutter",
);
assert(
  /family:\s*"standard"[\s\S]*?gutter:\s*true[\s\S]*?rhythm:\s*"standard"/.test(container),
  "Container defaults must use the standard family, gutter, and rhythm",
);
assert(
  pictureHero.includes("px-3 pb-8 pt-16 sm:px-5 lg:px-8") &&
    !pictureHero.includes("px-8 sm:px-10 lg:px-9"),
  "PictureHero must share the responsive page gutter recipe",
);
assert(
  dialog.includes("w-[calc(100%-1.5rem)]") &&
    dialog.includes("max-h-[calc(100dvh-1.5rem)]") &&
    dialog.includes("p-4") &&
    dialog.includes("sm:p-5"),
  "Dialog must remain viewport-bounded with 12px phone gutters and compact padding",
);
assert(
  drawer.includes("max-h-[80dvh]") &&
    drawer.includes("p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5"),
  "Drawer must use dynamic viewport bounds and safe-area-aware compact padding",
);
assert(
  /DialogClose className="[^"]*size-10/.test(modal),
  "Shared dialog close controls must keep a 40px target",
);

// Shell labels are functional navigation, never display typography or faux
// eyebrow copy. Locale values must stay sentence case in every supported locale.
assert(!/font-instrument|\bitalic\b|\buppercase\b|tracking-\[/.test(sidebar), "Sidebar labels must use plain Geist styling");
assert(sidebar.includes('"relative h-8 w-full"'), "Persistent sidebar navigation must keep its compact 32px row recipe");
assert(
  sidebar.includes("<ExploreArt />") &&
    sidebar.includes("animate-spin-slow") &&
    sidebar.includes("motion-reduce:animate-none"),
  "Sidebar creation actions must retain their purposeful art and reduced-motion-safe animation",
);
assert(
  /pill:\s*"h-9"/.test(shellHeaderControl) && /icon:\s*"size-9"/.test(shellHeaderControl),
  "Header controls must share one compact 36px peer recipe",
);
for (const [path, source] of [
  ["app/_components/shell/ShellHeader.tsx", shellHeader],
  ["app/_components/GlobalSearch.tsx", globalSearch],
  ["app/_components/NotificationBell.tsx", notificationBell],
  ["app/_components/cart/CartHeaderButton.tsx", cartHeaderButton],
  ["app/_components/AuthFlow.tsx", authFlow],
]) {
  assert(source.includes("shellHeaderControl"), `${path}: header peers must consume the shared compact size recipe`);
}
for (const locale of ["en", "es", "id", "pt", "sw"]) {
  const sections = JSON.parse(read(`messages/${locale}/common.json`)).sidebar.sections;
  for (const key of ["explore", "funding", "manage"]) {
    assert(
      sections[key] !== sections[key].toLocaleUpperCase(locale),
      `messages/${locale}/common.json: sidebar.${key} must remain sentence case`,
    );
  }
}

// High-risk composition and responsive regressions get direct guards until all
// routes have migrated to shared frame primitives.
assert(
  accountChrome.includes("isDetachedWorkspaceRoute") &&
    accountChrome.includes("projects\\/[^/?#]+\\/(?:certs|gallery|sites|timeline)"),
  "AccountChrome must detach full workspaces instead of nesting page frames",
);
assert(!/<Container\b/.test(accountAudio), "Embedded account audio must not create a second page frame");
assert(
  (manageSections.match(/className="max-w-3xl pt-4 pb-8"/g) ?? []).length === 2 &&
    !manageSections.includes("mr-auto ml-0 max-w-3xl"),
  "Single-column personal and organization settings must remain centered",
);
assert(
  (accountSettings.match(/className="divide-y divide-border"/g) ?? []).length === 2 &&
    !/<Accordion[^>]*className="space-y-1"/.test(accountSettings),
  "Settings categories must share one separator-led accordion root",
);
const featuredProjects = projectsExplore.slice(
  projectsExplore.indexOf("function FeaturedProjects"),
  projectsExplore.indexOf("function FeaturedProjectCard"),
);
assert(
  projectsExplore.includes("max-w-[90rem] px-3") &&
    featuredProjects.includes("items-stretch") &&
    projectsExplore.includes("self-stretch"),
  "Projects browse must use the wide frame and stretched peer grid/carousel",
);
assert(
  !featuredProjects.includes('t("description")'),
  "Featured projects must not restore redundant section description copy",
);
assert(
  organizationsExplore.includes("grid grid-cols-1") &&
    !organizationsExplore.includes('className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))]'),
  "Organizations grids must collapse before applying 300px card tracks",
);
assert(
  recordExplorer.includes("divide-y divide-border-soft border-t") &&
    !recordExplorer.includes("font-medium uppercase tracking-[0.08em]"),
  "Record lists must use real separators and functional labels",
);
assert(
  floatingTaina.includes("viewportBoundedSize") && floatingTaina.includes("VIEWPORT_PADDING * 2"),
  "Floating Tainá panels and tour bubbles must remain viewport bounded",
);
assert(
  floatingTaina.includes("usesCompactCanvasLauncher") && floatingTaina.includes('pathname === "/globe"'),
  "Floating Tainá must yield to full-canvas Globe controls until explicitly opened",
);
for (const [path, variant] of [
  ["app/projects/loading.tsx", "projects"],
  ["app/organizations/loading.tsx", "organizations"],
  ["app/observations/loading.tsx", "observations"],
]) {
  assert(
    read(path).includes(`variant="${variant}"`),
    `${path}: loading anatomy must select its resolved route variant`,
  );
}
assert(
  pageLoadingSkeletons.includes("lg:grid-cols-[minmax(0,5fr)_1px_minmax(0,7fr)]"),
  "BioBlitz loading must mirror the resolved split workspace",
);
for (const path of productionRuntimeTsxFiles) {
  const source = read(path);
  assert(
    !/(?:100vh|\b(?:min-h|h|max-h)-screen\b)/.test(source),
    `${path}: production viewport geometry must use dynamic viewport units`,
  );
  assert(
    !source.includes("w-[calc(100%-2rem)]"),
    `${path}: overlay geometry must preserve the 12px phone viewport gutter`,
  );
}

assert(/Omit<ComponentPropsWithoutRef<"span">, "children">/.test(typography), "BrandWord must not accept arbitrary children");
assert(/>\s*GainForest\s*<\/span>/.test(typography), "BrandWord must render the exact visible text GainForest");
assert(/font-instrument italic/.test(typography), "DisplayHeading must always use italic Instrument Serif");

for (const path of ["app/_components/Footer.tsx", "app/_components/shell/UnifiedSidebar.tsx"]) {
  const source = read(path);
  assert(/<BrandWord\b/.test(source), `${path}: the visible GainForest wordmark must use BrandWord`);
  assert(!/font-serif[^>]*>GainForest</.test(source), `${path}: the GainForest wordmark must not use generic font-serif`);
}

for (const path of sourceFiles("app")) {
  const source = read(path);
  for (const call of openingTags(source, "PictureHero")) {
    assert(/\bimageAlt=/.test(call), `${path}: every PictureHero call must explicitly provide imageAlt`);
    assert(!/\b(?:eyebrow|icon)=/.test(call), `${path}: PictureHero call retains a retired eyebrow/icon prop`);
  }

  for (const call of openingTags(source, "GracefulNotFound")) {
    assert(!/\beyebrow=/.test(call), `${path}: GracefulNotFound call retains the retired eyebrow prop`);
  }
}

for (const path of productionTsxFiles) {
  const source = read(path);

  // DisplayHeading is allowed by construction; native semantic headings must
  // state both sides of the visual contract in their complete opening tag.
  for (let level = 1; level <= 6; level += 1) {
    for (const heading of openingTags(source, `h${level}`)) {
      assert(
        headingUsesDisplayTypography(heading, { allowLocalInstrument: path === "app/global-error.tsx" }),
        `${path}:${lineNumber(source, heading)}: h${level} must use italic Instrument Serif`,
      );
    }
  }

  if (!garamondAllowedFiles.has(path)) {
    const forbidden = source.match(/font-(?:garamond|serif)\b|--font-garamond-var/);
    assert(
      !forbidden,
      `${path}${forbidden ? `:${lineNumber(source, forbidden[0])}` : ""}: non-brand Garamond/serif usage is forbidden`,
    );
  }
}

if (failures.length > 0) {
  console.error(`UI contract check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UI contract check passed (shared foundation, production heading typography, and direct callers).");
