#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const root = process.cwd();
const locales = ["en", "es", "id", "pt", "sw"];
const bundles = [
  "root",
  "audiomothGuide",
  "bumicert",
  "cart",
  "changelog",
  "common",
  "deleteAccount",
  "legacy",
  "marketplace",
  "modals",
  "privacy",
  "tainaGuide",
  "upload",
];

const removedKeys = [
  "audiomothGuide.hero.kicker",
  "cart.checkoutPage.reward.contributed",
  "cart.checkoutPage.reward.eyebrow",
  "cart.checkoutPage.reward.guardianOf",
  "cart.checkoutPage.reward.overallEyebrow",
  "cart.myCards.eyebrow",
  "changelog.eyebrow",
  "common.accountProjects.emptyEyebrow",
  "common.atproto.kicker",
  "common.cgs.kicker",
  "common.dataJobs.hero.kicker",
  "common.epds.kicker",
  "common.epdsRouter.kicker",
  "common.groupInvitations.invitePage.eyebrow",
  "common.internalBadges.eyebrow",
  "common.soundscape.hero.eyebrow",
  "common.status.hero.eyebrow",
  "common.taina.hero.eyebrow",
  "common.walletExplainer.kicker",
  "common.walletExplainer.part1.label",
  "common.walletExplainer.part2.label",
  "common.walletExplainer.part3.label",
  "common.walletExplainer.part4.label",
  "marketplace.bioblitz.legal.programLabel",
  "marketplace.globe.focus.organizationLabel",
  "marketplace.globe.focus.projectLabel",
  "marketplace.globe.tree.species",
  "marketplace.grants.interoperable.category",
  "marketplace.labeler.eyebrow",
  "marketplace.observationPage.kind",
  "marketplace.projects.catalog.eyebrow",
  "marketplace.projects.categories.eyebrow",
  "marketplace.projects.empty.eyebrow",
  "marketplace.projects.featured.eyebrow",
  "marketplace.projects.support.eyebrow",
];

function bundlePath(locale, bundle) {
  return bundle === "root"
    ? path.join(root, "messages", `${locale}.json`)
    : path.join(root, "messages", locale, `${bundle}.json`);
}

function scalarShape(value, prefix = "", output = new Map()) {
  if (value === null || typeof value !== "object") {
    output.set(prefix, value === null ? "null" : typeof value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scalarShape(entry, `${prefix}[${index}]`, output));
    if (value.length === 0) output.set(`${prefix}[]`, "array");
    return output;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) output.set(`${prefix}{}`, "object");
  for (const [key, entry] of entries) {
    scalarShape(entry, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function messageSignature(message, context, errors) {
  const argumentsByName = new Map();
  const tags = new Set();
  let ast;
  try {
    ast = parse(message);
  } catch (error) {
    errors.push(`${context} is not valid ICU: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const addArgument = (name, requirement) => {
    const requirements = argumentsByName.get(name) ?? new Set();
    requirements.add(requirement);
    argumentsByName.set(name, requirements);
  };
  const visit = (elements) => {
    for (const element of elements) {
      if (element.type === TYPE.argument || element.type === TYPE.select || element.type === TYPE.plural) {
        // Select/plural structure may differ by locale, but all require the same supplied value.
        addArgument(element.value, "value");
      } else if (element.type === TYPE.number) addArgument(element.value, "number");
      else if (element.type === TYPE.date) addArgument(element.value, "date");
      else if (element.type === TYPE.time) addArgument(element.value, "time");
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        Object.values(element.options).forEach((option) => visit(option.value));
      } else if (element.type === TYPE.tag) {
        tags.add(element.value);
        visit(element.children);
      }
    }
  };
  visit(ast);
  return {
    arguments: [...argumentsByName].map(([name, requirements]) => [name, [...requirements].sort()]).sort(([a], [b]) => a.localeCompare(b)),
    tags: [...tags].sort(),
  };
}

function hasPath(value, key) {
  let current = value;
  for (const segment of key.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    if ([".git", ".next", "node_modules"].includes(entry)) continue;
    const file = path.join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) walk(file, output);
    else if (/\.(?:[jt]sx?)$/.test(entry)) output.push(file);
  }
  return output;
}

function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current))) {
    current = current.expression;
  }
  return current;
}

function staticStrings(node) {
  const expression = unwrapExpression(node);
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = staticStrings(expression.whenTrue);
    const whenFalse = staticStrings(expression.whenFalse);
    return whenTrue.length > 0 && whenFalse.length > 0 ? [...new Set([...whenTrue, ...whenFalse])] : [];
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticStrings(expression.left);
    const right = staticStrings(expression.right);
    return left.flatMap((leftValue) => right.map((rightValue) => `${leftValue}${rightValue}`));
  }
  return [];
}

function literal(node) {
  return staticStrings(node)[0] ?? null;
}

function translationNamespace(call) {
  const first = call.arguments[0];
  const direct = literal(first);
  if (direct !== null) return direct;
  if (first && ts.isObjectLiteralExpression(first)) {
    const property = first.properties.find(
      (entry) => ts.isPropertyAssignment(entry)
        && ((ts.isIdentifier(entry.name) && entry.name.text === "namespace")
          || (ts.isStringLiteral(entry.name) && entry.name.text === "namespace")),
    );
    if (property && ts.isPropertyAssignment(property)) return literal(property.initializer);
  }
  return null;
}

function usedStaticKeys() {
  const used = new Set();
  for (const file of [...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const scopes = [new Map()];
    const lookup = (name) => {
      for (let index = scopes.length - 1; index >= 0; index -= 1) {
        if (scopes[index].has(name)) return scopes[index].get(name);
      }
      return null;
    };
    function visit(node) {
      const scoped = ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node);
      if (scoped) scopes.push(new Map());
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        let initializer = node.initializer;
        if (ts.isAwaitExpression(initializer)) initializer = initializer.expression;
        if (ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)
          && ["getTranslations", "useTranslations"].includes(initializer.expression.text)) {
          const namespace = translationNamespace(initializer);
          if (namespace !== null) scopes.at(-1).set(node.name.text, namespace);
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
          const keys = staticStrings(node.arguments[0]);
          if (namespace !== null) {
            for (const key of keys) used.add(namespace ? `${namespace}.${key}` : key);
          }
        }
      }
      ts.forEachChild(node, visit);
      if (scoped) scopes.pop();
    }
    visit(source);
  }
  return used;
}

const errors = [];
const catalogs = new Map();
for (const bundle of bundles) {
  const englishPath = bundlePath("en", bundle);
  if (!existsSync(englishPath)) continue;
  const englishValue = JSON.parse(readFileSync(englishPath, "utf8"));
  catalogs.set(`en:${bundle}`, englishValue);
  const englishShape = scalarShape(englishValue);
  for (const locale of locales.slice(1)) {
    const localizedPath = bundlePath(locale, bundle);
    if (!existsSync(localizedPath)) {
      errors.push(`${path.relative(root, localizedPath)} is missing`);
      continue;
    }
    const localizedValue = JSON.parse(readFileSync(localizedPath, "utf8"));
    catalogs.set(`${locale}:${bundle}`, localizedValue);
    const localizedShape = scalarShape(localizedValue);
    for (const [key, type] of englishShape) {
      if (!localizedShape.has(key)) errors.push(`${path.relative(root, localizedPath)} is missing scalar ${key}`);
      else if (localizedShape.get(key) !== type) errors.push(`${path.relative(root, localizedPath)}:${key} has type ${localizedShape.get(key)}, expected ${type}`);
    }
    for (const key of localizedShape.keys()) {
      if (!englishShape.has(key)) errors.push(`${path.relative(root, localizedPath)} has extra scalar ${key}`);
    }
    const englishStrings = new Map();
    const localizedStrings = new Map();
    const collectStrings = (value, prefix, output) => {
      if (typeof value === "string") output.set(prefix, value);
      else if (Array.isArray(value)) value.forEach((entry, index) => collectStrings(entry, `${prefix}[${index}]`, output));
      else if (value && typeof value === "object") Object.entries(value).forEach(([entryKey, entry]) => collectStrings(entry, prefix ? `${prefix}.${entryKey}` : entryKey, output));
    };
    collectStrings(englishValue, "", englishStrings);
    collectStrings(localizedValue, "", localizedStrings);
    for (const [key, englishMessage] of englishStrings) {
      const localizedMessage = localizedStrings.get(key);
      if (localizedMessage === undefined) continue;
      const englishSignature = messageSignature(englishMessage, `${path.relative(root, englishPath)}:${key}`, errors);
      const localizedSignature = messageSignature(localizedMessage, `${path.relative(root, localizedPath)}:${key}`, errors);
      if (englishSignature && localizedSignature && JSON.stringify(englishSignature) !== JSON.stringify(localizedSignature)) {
        errors.push(`${path.relative(root, localizedPath)}:${key} has ICU arguments/tags ${JSON.stringify(localizedSignature)}, expected ${JSON.stringify(englishSignature)}`);
      }
    }
  }
}

const used = usedStaticKeys();
for (const removed of removedKeys) {
  const [bundle, ...segments] = removed.split(".");
  const localKey = segments.join(".");
  for (const locale of locales) {
    const catalog = catalogs.get(`${locale}:${bundle}`);
    if (catalog && hasPath(catalog, localKey)) errors.push(`${removed} still exists in ${locale}`);
  }
  if (used.has(removed)) errors.push(`${removed} still has a static production call site`);
}

// Landing catalogs are merged at the root rather than under a file namespace.
for (const locale of locales) {
  const landing = catalogs.get(`${locale}:root`);
  for (const key of ["landing.certificate.eyebrow", "landing.stats.liveLabel"]) {
    if (landing && hasPath(landing, key)) errors.push(`${key} still exists in ${locale}`);
  }
}
for (const key of ["landing.certificate.eyebrow", "landing.stats.liveLabel"]) {
  if (used.has(key)) errors.push(`${key} still has a static production call site`);
}

if (errors.length) {
  console.error(`Message parity check failed (${errors.length}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Message parity passed for ${locales.length} locales and ${bundles.length} bundles; ${removedKeys.length + 2} retired keys remain absent and unused.`);
