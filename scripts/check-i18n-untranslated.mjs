import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const locales = ["es", "id", "pt", "sw"];
const namespaces = ["root", "bumicert", "common", "legacy", "marketplace", "modals", "upload"];

const allowedExactValues = new Set([
  "",
  "A → Z",
  "Z → A",
  "Audio",
  "Video",
  "Bumicert",
  "Bumicerts",
  "Bumicerts — Bumicerts",
  "GainForest",
  "Green Globe",
  "Ma Earth",
  "GitHub",
  "X (Twitter)",
  "Telegram",
  "USDC",
  "Base",
  "DBH",
  "DBH (cm)",
  "DID",
  "GBIF",
  "PDS",
  "CSV",
  "TSV",
  "ZIP",
  "GeoJSON",
  "KoboToolbox",
  "AudioMoth",
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
  "Admin",
  "Banner",
  "Format",
  "format",
  "online",
  "Tainá",
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
  "{count, plural, one {# Bumicert} other {# Bumicerts}}",
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
  return JSON.parse(readFileSync(file, "utf8"));
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

function isAllowed(pathKey, value) {
  return allowedExactValues.has(value)
    || allowedPathPatterns.some((pattern) => pattern.test(pathKey))
    || technicalValuePatterns.some((pattern) => pattern.test(value));
}

const problems = [];

for (const namespace of namespaces) {
  const englishPath = namespacePath("en", namespace);
  if (!existsSync(englishPath)) continue;
  const english = new Map(flattenStrings(readJson(englishPath)));

  for (const locale of locales) {
    const localePath = namespacePath(locale, namespace);
    if (!existsSync(localePath)) continue;

    for (const [key, value] of flattenStrings(readJson(localePath))) {
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

if (problems.length > 0) {
  console.error(`Found ${problems.length} likely untranslated locale string${problems.length === 1 ? "" : "s"}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("No likely untranslated exact English locale fallbacks found.");
