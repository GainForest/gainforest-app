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
 *   - app/_lib/taina-sim.ts — LLM system prompt, not user-facing copy.
 *
 * Replacement style:
 *   " — "  →  "; "     (drop leading space, keep one trailing space)
 *   "—"    →  ";"      (bare em-dash, rare)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const TARGETS = [
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
].map((p) => path.join(REPO_ROOT, p));

function transformText(s) {
  return s.replace(/ — /g, "; ").replace(/—/g, ";");
}

function rewrite(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  if (!src.includes("\u2014")) return { changes: 0 };

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
        const start = node.getStart(sourceFile);
        const raw = src.slice(start, node.end);
        if (raw.includes("\u2014")) {
          edits.push({ start, end: node.end, raw });
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

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
  if (changes) fs.writeFileSync(filePath, out);
  return { changes };
}

let total = 0;
for (const f of TARGETS) {
  if (!fs.existsSync(f)) {
    console.warn("skipping (missing):", path.relative(REPO_ROOT, f));
    continue;
  }
  const { changes } = rewrite(f);
  if (changes) {
    console.log(`${path.relative(REPO_ROOT, f)}: ${changes} nodes touched`);
    total += changes;
  }
}
console.log(`TOTAL: ${total} string/JSX-text nodes edited`);
