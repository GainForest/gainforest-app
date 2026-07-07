import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const locales = ["es", "id", "pt", "sw"];
const allLocales = ["en", ...locales];
const namespaces = ["root", "bumicert", "cart", "common", "legacy", "marketplace", "modals", "privacy", "tainaGuide", "upload"];

const allowedExactValues = new Set([
  "",
  "A → Z",
  "Z → A",
  "Audio",
  "Video",
  "Drone",
  "Bumicert",
  "Bumicerts",
  "Bumicerts — Bumicerts",
  "Cert",
  "Certs",
  "Certified",
  "esc",
  "GainForest",
  "Green Globe",
  "Ma Earth",
  "ESA WorldCover 2021",
  "BioBlitz",
  "GitHub",
  "X (Twitter)",
  "Telegram",
  "USDC",
  "Base",
  "Ethereum",
  "DBH",
  "DBH (cm)",
  "PDF",
  "DID",
  "GBIF",
  "PDS",
  "CSV",
  "TSV",
  "ZIP",
  "GeoJSON",
  "KoboToolbox",
  "AudioMoth",
  "AudioMoth — GainForest",
  "Firmware",
  "Firmware: {firmware}",
  "UTC",
  "Hz",
  "kHz",
  "Latitude",
  "Longitude",
  "Altitude",
  "Habitat",
  "Genus",
  "Media",
  "Status",
  "Total",
  "Menu",
  "Tags",
  "Gain",
  "Valid",
  "Error",
  "Handle",
  "Link",
  "Admin",
  // "Personal" is the same word in Spanish (publishAs badge).
  "Personal",
  "Banner",
  "Format",
  "format",
  "online",
  "Tainá",
  "Tainá — GainForest",
  "Bumi",
  "Pteronotus parnellii",
  "survey-2024-amazon-site-a",
  "night-recording, tropical-forest",
  "Green Globe —",
  "GainForest v",
  "GainForest e.V.",
  "Schwandenacker 35, 8052 Zurich, Switzerland",
  "team@gainforest.net",
  "{balance} USDC",
  "{lat}, {lng}",
  "{count, number}",
  "{count, plural, one {# Bumicert} other {# Bumicerts}}",
  "{count, plural, one {# Cert} other {# Certs}}",
]);

const allowedPathPatterns = [
  /^autoCountries\./,
  /^footer\.links\.(twitter|github|greenGlobe)$/,
  /^sidebar\.social\.(twitter|github)$/,
  /^maEarthFundingRound\.hero\.logoAlt$/,
  /^account\.metadata\.bumicertsTitle$/,
  /^modals\.websitePlaceholder$/,
];

const technicalValuePatterns = [
  /^https?:\/\//,
  /^\{[^}]+\} USDC$/,
  /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
];

function readJson(file) {
  return JSON.parse(readFileSync(path.join(projectRoot, file), "utf8"));
}

function flattenStrings(value, prefix = "", out = []) {
  if (typeof value === "string") {
    out.push([prefix, value]);
    return out;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenStrings(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function namespacePath(locale, namespace) {
  return namespace === "root"
    ? path.join("messages", `${locale}.json`)
    : path.join("messages", locale, `${namespace}.json`);
}

function hasMessageKey(messages, key) {
  let current = messages;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return false;
    }
    current = current[segment];
  }
  return true;
}

function isAllowed(pathKey, value) {
  return allowedExactValues.has(value)
    || allowedPathPatterns.some((pattern) => pattern.test(pathKey))
    || technicalValuePatterns.some((pattern) => pattern.test(value));
}

function walkSourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const file = path.join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      walkSourceFiles(file, out);
    } else if (/\.(?:tsx?|jsx?)$/.test(name)) {
      out.push(file);
    }
  }
  return out;
}

function stringLiteralArgument(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function collectStaticTranslationKeys() {
  const files = [
    ...walkSourceFiles(path.join(projectRoot, "app")),
    ...walkSourceFiles(path.join(projectRoot, "components")),
  ];
  const used = new Map();

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const scopes = [new Map()];
    const enterScope = () => scopes.push(new Map());
    const exitScope = () => scopes.pop();
    const lookup = (name) => {
      for (let index = scopes.length - 1; index >= 0; index -= 1) {
        if (scopes[index].has(name)) return scopes[index].get(name);
      }
      return null;
    };

    function visit(node) {
      const pushesScope = ts.isBlock(node) || ts.isSourceFile(node) || ts.isFunctionLike(node);
      if (pushesScope) enterScope();

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        let initializer = node.initializer;
        if (ts.isAwaitExpression(initializer)) initializer = initializer.expression;
        if (
          ts.isCallExpression(initializer)
          && ts.isIdentifier(initializer.expression)
          && (initializer.expression.text === "useTranslations" || initializer.expression.text === "getTranslations")
        ) {
          const namespace = stringLiteralArgument(initializer.arguments[0]);
          if (namespace !== null) scopes[scopes.length - 1].set(node.name.text, namespace);
        }
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const namespace = lookup(node.expression.text);
        const key = stringLiteralArgument(node.arguments[0]);
        if (namespace !== null && key !== null) {
          const messageKey = namespace ? `${namespace}.${key}` : key;
          used.set(`${path.relative(projectRoot, file)}:${messageKey}`, {
            file: path.relative(projectRoot, file),
            key: messageKey,
          });
        }
      }

      ts.forEachChild(node, visit);
      if (pushesScope) exitScope();
    }

    visit(source);
  }

  return [...used.values()];
}

const messagesByLocale = Object.fromEntries(
  allLocales.map((locale) => {
    const rootMessages = readJson(namespacePath(locale, "root"));
    const merged = { ...rootMessages };
    for (const namespace of namespaces.filter((entry) => entry !== "root")) {
      const file = namespacePath(locale, namespace);
      if (existsSync(path.join(projectRoot, file))) merged[namespace] = readJson(file);
    }
    return [locale, merged];
  }),
);

const problems = [];

function assertBrandNameCasing(locale, namespace, entries) {
  for (const [key, value] of entries) {
    // Brand names should not be localized or recased. Lowercase domains/emails
    // like team@gainforest.net are technical identifiers and are allowed.
    const visibleText = value
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\bgainforest\.app\b/gi, "")
      .replace(/[\w.+-]+@gainforest\.\w+/gi, "");
    const badMatch = visibleText.match(/gain\s*forest|gainforest/iu);
    if (badMatch && badMatch[0] !== "GainForest") {
      problems.push(`${namespacePath(locale, namespace)}:${key} must keep the brand name as \"GainForest\": ${JSON.stringify(value)}`);
    }
  }
}

for (const namespace of namespaces) {
  const englishPath = namespacePath("en", namespace);
  if (!existsSync(path.join(projectRoot, englishPath))) continue;
  const english = new Map(flattenStrings(readJson(englishPath)));
  assertBrandNameCasing("en", namespace, english);

  for (const locale of locales) {
    const localePath = namespacePath(locale, namespace);
    if (!existsSync(path.join(projectRoot, localePath))) continue;
    const localized = new Map(flattenStrings(readJson(localePath)));
    assertBrandNameCasing(locale, namespace, localized);

    for (const [key] of english) {
      if (!localized.has(key)) {
        problems.push(`${localePath}:${key} is missing (present in ${englishPath})`);
      }
    }

    for (const [key, value] of localized) {
      const englishValue = english.get(key);
      if (
        englishValue === value
        && /[A-Za-z]{3,}/.test(value)
        && !isAllowed(key, value)
      ) {
        problems.push(`${localePath}:${key} is still identical to English: ${JSON.stringify(value)}`);
      }
    }
  }
}

for (const { file, key } of collectStaticTranslationKeys()) {
  for (const locale of allLocales) {
    if (!hasMessageKey(messagesByLocale[locale], key)) {
      problems.push(`${file} uses missing ${locale} message: ${key}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Found ${problems.length} i18n problem${problems.length === 1 ? "" : "s"}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("No missing static i18n messages or likely untranslated exact English locale fallbacks found.");
