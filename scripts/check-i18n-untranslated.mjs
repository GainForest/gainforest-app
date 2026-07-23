import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const locales = ["es", "id", "pt", "sw"];
const allLocales = ["en", ...locales];
const namespaces = ["root", "audiomothGuide", "bumicert", "cart", "changelog", "common", "deleteAccount", "legacy", "marketplace", "modals", "privacy", "tainaGuide", "upload"];

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
  "iNaturalist",
  "Bluesky",
  "Instagram",
  "Raspberry Pi",
  "Sensor",
  "Starlink",
  "Laptop",
  "Etherscan",
  "AudioMoth #14",
  "GainForest — {name}",
  "GainForest — {org}",
  "123456789:ABCdefGhIJKlmNoPQRstuVwxyz",
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
  "ePDS",
  "Router",
  "AT Protocol",
  "atproto.com",
  "link",
  "CGS",
  "Certified Group Service",
  "CSV",
  "TSV",
  "ZIP",
  "GeoJSON",
  "KoboToolbox",
  "AudioMoth",
  "AudioMoth — GainForest",
  "Arbimon",
  "48 kHz",
  "USB/OFF",
  "CUSTOM",
  "DEFAULT",
  // Scientific names are universal rather than translated.
  "Boana faber",
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
  "Total",
  "Menu",
  "Tags",
  "Gain",
  "Valid",
  "Handle",
  "Link",
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
  /^devices\.status\.(up|down)$/,
  /^coreDashboard\.hero\.title$/,
  /^detail\.recovery\.sidebar\.email$/,
  /^(?:status|error)$/i,
  /^groupInvitations\.members\.roleAdmin$/,
  /^create\.draft\.hydration\.errorTitle$/,
  /^(?:accountTabs|sidebar\.profileRow|accountOrganizations\.role)\.admin$/,
  /^adminModeration\.page\.title$/,
  /^cgs\.repo\.roleAdmin$/,
  /^cgs\.roles\.role\.admin\.name$/,
  /^footer\.links\.status$/,
  /^equipment\.(?:table|form)\.status$/,
  /^autoDiscovered\.auto104$/,
  /^settings\.dataCouncil\.roles\.admin$/,
  /^dashboardClient\.organizations\.roles\.admin$/,
  /^(?:observations\.colStatus|trees\.preview\.status)$/,
  /^manageTrees\.upload\.time\.minutes$/,
];

// Dynamic translation calls cannot be proven from a single literal key. Each
// identifier/empty-prefix expression below was reviewed against a closed typed
// key set in its caller. New arbitrary t(keyName) calls must be added explicitly
// after review; meaningful template prefixes are validated against every locale.
const reviewedDynamicTranslationCalls = new Set([
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.reforestation",
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.forest_protection",
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.biodiversity_monitoring",
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.community_stewardship",
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.carbon_removal",
  "app/(manage)/manage/certs/new/_components/NewBumicertClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS.restoration_maintenance",
  "app/(manage)/manage/observations/_components/LocationPickerModal.tsx:upload.observations.location:LAYER_OPTIONS.find((option) => option.id === activeLayer)?.labelKey ?? \"layerStreets\"",
  "app/(manage)/manage/observations/_components/LocationPickerModal.tsx:upload.observations.location:option.labelKey",
  "app/(manage)/manage/observations/_components/ObservationsClient.tsx:upload.observations.status:status",
  "app/(manage)/manage/projects/_components/ManageProjectsClient.tsx:common.workScopes:WORK_SCOPE_MESSAGE_KEYS[key]",
  "app/(manage)/manage/trees/_components/TreesClient.tsx:common.manageTrees.manager:key as never",
  "app/_components/DonationsHub.tsx:marketplace.donationsHub.tabs:view",
  "app/_components/DonationsHub.tsx:marketplace.dashboard.periods:item",
  "app/_components/shell/ShellHeader.tsx:common.sidebar.headerActions:route.labelKey",
  "app/_components/shell/UnifiedSidebar.tsx:common.sidebar.sections:section.id",
  "app/_components/shell/UnifiedSidebar.tsx:common.sidebar.items:item.id",
  "app/account/_components/AccountTabBar.tsx:common.accountTabs:tab.labelKey",
  "app/account/_components/ObservationsSubNav.tsx:common.accountTabs:tab.labelKey",
  "app/audiomoth/_components/AudioMothClient.tsx:common.audiomoth:detailKeys[progress.phase]",
  "app/audiomoth/_components/AudioMothClient.tsx:common.audiomoth.configure:key",
  "app/bioblitz/BioblitzClient.tsx:marketplace.bioblitz.status:status",
  "app/bioblitz/BioblitzClient.tsx:marketplace.bioblitz.status:itemStatus",
  "app/bioblitz/BioblitzClient.tsx:marketplace.bioblitz.board.scope:option",
  "app/cert/[did]/[rkey]/_components/BumicertDetailHeader.tsx:bumicert.detail.headerTabs:TAB_LABEL_KEYS[tab]",
  "app/cert/[did]/[rkey]/page.tsx:bumicert.detail.recovery.donations:rankBadge.labelKey",
  "app/changelog/ChangelogView.tsx:changelog:path as never",
  "app/feed/FeedAudioClip.tsx:common.audiomoth.label.categories:clip.category",
  "app/globe/_components/GlobeExplorer.tsx:marketplace.globe:item.labelKey",
  "app/globe/_components/GlobeExplorer.tsx:marketplace.globe:labelKey",
  "app/leaderboard/LeaderboardClient.tsx:marketplace.leaderboard.sort:SORT_TRANSLATION_KEYS[value]",
  "app/leaderboard/LeaderboardClient.tsx:marketplace.leaderboard.card:labelKey",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${tour.guideId}.title`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${tour.guideId}.tour.${activeTourStep.id}`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${guideView.id}.title`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${guide.id}.question`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${guideView.id}.intro`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${guideView.id}.steps.${step.id}.title`",
  "app/_components/FloatingTainaGuide.tsx:tainaGuide.guides:`${guideView.id}.steps.${step.id}.body`",
  "app/_components/HomeLanding.tsx:landing.certificate.faqItems:`${item}.question`",
  "app/_components/HomeLanding.tsx:landing.certificate.faqItems:`${item}.answer`",
  "app/docs/wallet-service/_components/ContractReader.tsx:common.walletExplainer.contract:`${excerpt.id}Note`",
]);

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

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

function staticStringArguments(node) {
  const expression = unwrapExpression(node);
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = staticStringArguments(expression.whenTrue);
    const whenFalse = staticStringArguments(expression.whenFalse);
    return whenTrue.length > 0 && whenFalse.length > 0 ? [...new Set([...whenTrue, ...whenFalse])] : [];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStringArguments(expression.left);
    const right = staticStringArguments(expression.right);
    return left.flatMap((leftValue) => right.map((rightValue) => `${leftValue}${rightValue}`));
  }
  return [];
}

function stringLiteralArgument(node) {
  return staticStringArguments(node)[0] ?? null;
}

function dynamicKeyPrefix(node) {
  const expression = unwrapExpression(node);
  return expression && ts.isTemplateExpression(expression) ? expression.head.text : null;
}

function collectStaticTranslationKeys() {
  const files = [
    ...walkSourceFiles(path.join(projectRoot, "app")),
    ...walkSourceFiles(path.join(projectRoot, "components")),
  ];
  const used = new Map();
  const dynamic = new Map();

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

      if (ts.isCallExpression(node)) {
        const translator = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "rich" && ts.isIdentifier(node.expression.expression)
            ? node.expression.expression.text
            : null;
        if (translator) {
          const namespace = lookup(translator);
          const keys = staticStringArguments(node.arguments[0]);
          if (namespace !== null && keys.length > 0) {
            for (const key of keys) {
              const messageKey = namespace ? `${namespace}.${key}` : key;
              used.set(`${path.relative(projectRoot, file)}:${messageKey}`, {
                file: path.relative(projectRoot, file),
                key: messageKey,
              });
            }
          } else if (namespace !== null && node.arguments[0]) {
            const relativeFile = path.relative(projectRoot, file);
            const prefix = dynamicKeyPrefix(node.arguments[0]);
            const expression = node.arguments[0].getText(source);
            const reviewKey = `${relativeFile}:${namespace}:${expression}`;
            const messagePrefix = prefix ? (namespace ? `${namespace}.${prefix}` : prefix) : null;
            dynamic.set(reviewKey, { file: relativeFile, namespace, expression, messagePrefix, reviewKey });
          }
        }
      }

      ts.forEachChild(node, visit);
      if (pushesScope) exitScope();
    }

    visit(source);
  }

  return { staticKeys: [...used.values()], dynamicPrefixes: [...dynamic.values()] };
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

const { staticKeys, dynamicPrefixes } = collectStaticTranslationKeys();

for (const { file, key } of staticKeys) {
  for (const locale of allLocales) {
    if (!hasMessageKey(messagesByLocale[locale], key)) {
      problems.push(`${file} uses missing ${locale} message: ${key}`);
    }
  }
}

for (const { file, expression, messagePrefix, reviewKey } of dynamicPrefixes) {
  if (!messagePrefix) {
    if (!reviewedDynamicTranslationCalls.has(reviewKey)) {
      problems.push(`${file} uses unreviewed arbitrary dynamic message key ${expression} (${reviewKey}); add an explicit reviewed allowlist entry or use a static/meaningfully-prefixed key`);
    }
    continue;
  }
  for (const locale of allLocales) {
    const keys = flattenStrings(messagesByLocale[locale]).map(([key]) => key);
    if (!keys.some((key) => key.startsWith(messagePrefix))) {
      problems.push(`${file} uses dynamic ${locale} message prefix with no matching messages: ${messagePrefix}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Found ${problems.length} i18n problem${problems.length === 1 ? "" : "s"}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log("No missing static i18n messages or likely untranslated exact English locale fallbacks found.");
