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
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
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

if (failures.length > 0) {
  console.error(`UI contract check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UI contract check passed (foundation APIs and direct callers).\nRoute-wave typography/copy cleanup remains intentionally outside this focused guard.");
