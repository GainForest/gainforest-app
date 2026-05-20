#!/usr/bin/env node
/**
 * Replace em-dashes (—) with semicolons (;) in user-facing strings only.
 *
 * Uses the TypeScript compiler API so we walk the AST instead of guessing
 * with regex / state machines. Em-dashes are touched only inside:
 *
 *   - StringLiteral nodes ("..." and '...')
 *   - NoSubstitutionTemplateLiteral (`...` with no ${})
 *   - TemplateHead / TemplateMiddle / TemplateTail (the literal-text spans
 *     of template literals; ${expr} parts are NOT touched)
 *   - JsxText nodes (the text content between JSX tags)
 *
 * Skipped:
 *   - All comments (line, block, JSX). We use `node.getStart(sourceFile)`
 *     instead of `node.pos` to exclude the leading trivia (= leading
 *     comments + whitespace) that the TS compiler attaches to each node.
 *   - All identifiers and code expressions.
 *   - app/_lib/taina-sim.ts; that file's strings are the LLM system
 *     prompt for the Taina sim, not visitor-facing copy.
 *
 * Replacement style:
 *   " — "  →  "; "     (drop leading space, keep one trailing space)
 *   "—"    →  ";"      (bare em-dash, rare)
 *
 * Usage:
 *   node scripts/em-dash-sweep.mjs               # sweep the curated TARGETS list
 *   node scripts/em-dash-sweep.mjs file1 file2   # sweep specific paths (used by pre-commit)
 *   node scripts/em-dash-sweep.mjs --check       # exit non-zero if any em-dashes remain in TARGETS
 *   node scripts/em-dash-sweep.mjs --check f1    # check specific paths only
 *
 * --check mode prints offending file:line and exits 1; useful for CI.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// Curated list used when invoked with no file args. Add new user-facing TS /
// TSX files here. Files outside this list are still swept when explicitly
// passed (e.g. from the pre-commit hook).
const DEFAULT_TARGETS = [
  "app/_lib/i18n.ts",
  "app/_lib/blog.ts",
  "app/_components/ChoosePath.tsx",
  "app/_components/FloatingTaina.tsx",
  "app/_components/Media.tsx",
  "app/_components/SignInPopover.tsx",
  "app/_components/Supporters.tsx",
  "app/_components/TainaFeature.tsx",
  "app/_components/TopNavView.tsx",
  "app/api/sim-chat/route.ts",
  "app/layout.tsx",
];

// Hard-skipped no matter how invoked. taina-sim.ts is the LLM system prompt;
// rewriting its em-dashes would change what we tell the bot to do, not what
// visitors see.
const HARD_SKIPS = new Set([
  path.join(REPO_ROOT, "app/_lib/taina-sim.ts"),
]);

function transformText(s) {
  return s.replace(/ — /g, "; ").replace(/—/g, ";");
}

function collectEdits(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("\u2014")) return { src, edits: [] };

  const sourceFile = ts.createSourceFile(
    filePath,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const edits = [];
  function visit(node) {
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
      case ts.SyntaxKind.JsxText: {
        // node.pos includes leading trivia (comments + whitespace).
        // getStart(sourceFile) gives the position where the token
        // itself begins, so we don't accidentally rewrite comments
        // that happen to sit directly above a literal.
        const start = node.getStart(sourceFile);
        const raw = src.slice(start, node.end);
        if (raw.includes("\u2014")) {
          const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
          edits.push({ start, end: node.end, raw, line });
        }
        return; // don't recurse into literals
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { src, edits };
}

function applyEdits(src, edits) {
  let out = src;
  let changes = 0;
  for (let i = edits.length - 1; i >= 0; i--) {
    const { start, end, raw } = edits[i];
    const replaced = transformText(raw);
    if (replaced !== raw) {
      out = out.slice(0, start) + replaced + out.slice(end);
      changes += 1;
    }
  }
  return { out, changes };
}

function resolvePaths(args) {
  if (args.length === 0) return DEFAULT_TARGETS.map((p) => path.join(REPO_ROOT, p));
  return args.map((p) => (path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)));
}

function main() {
  const args = process.argv.slice(2);
  let check = false;
  const fileArgs = [];
  for (const a of args) {
    if (a === "--check" || a === "-c") check = true;
    else fileArgs.push(a);
  }

  const paths = resolvePaths(fileArgs);
  let totalChanges = 0;
  let totalRemaining = 0;
  const remainingDetails = [];

  for (const fp of paths) {
    if (HARD_SKIPS.has(fp)) continue;
    if (!fs.existsSync(fp)) {
      if (fileArgs.length === 0) continue;
      console.warn(`skip (missing): ${path.relative(REPO_ROOT, fp)}`);
      continue;
    }
    if (!/\.tsx?$/.test(fp)) continue;

    const { src, edits } = collectEdits(fp);
    if (!edits.length) continue;

    if (check) {
      totalRemaining += edits.length;
      for (const e of edits) {
        remainingDetails.push(
          `${path.relative(REPO_ROOT, fp)}:${e.line}: ${e.raw
            .replace(/\n/g, " ")
            .slice(0, 100)}`
        );
      }
      continue;
    }

    const { out, changes } = applyEdits(src, edits);
    if (changes) {
      fs.writeFileSync(fp, out);
      console.log(`${path.relative(REPO_ROOT, fp)}: ${changes} nodes touched`);
      totalChanges += changes;
    }
  }

  if (check) {
    if (totalRemaining > 0) {
      console.error(
        `\u2717 ${totalRemaining} user-facing em-dash${totalRemaining === 1 ? "" : "es"} remain:`
      );
      for (const d of remainingDetails) console.error("  " + d);
      console.error(`\nRun \`pnpm sweep:emdash\` to fix automatically.`);
      process.exit(1);
    }
    console.log("\u2713 no user-facing em-dashes");
    return;
  }

  if (totalChanges > 0) {
    console.log(`TOTAL: ${totalChanges} string/JSX-text nodes edited`);
  }
}

main();
