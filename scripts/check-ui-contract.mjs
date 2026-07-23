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
