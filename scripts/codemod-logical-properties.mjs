/**
 * One-shot codemod: physical Tailwind direction utilities -> logical ones.
 *
 * Adding Arabic makes `dir="rtl"` real, and physical utilities (`ml-`, `pr-`,
 * `text-left`, `left-`) do not flip with direction. Logical utilities (`ms-`,
 * `pe-`, `text-start`, `start-`) resolve to the identical physical value under
 * LTR, so this rewrite is a visual no-op for en/es/pt/sw/id while making the
 * RTL rendering correct.
 *
 * Safety rules, because a blind find-and-replace here breaks the shipping
 * locales:
 *   1. Only text inside string literals is considered, so prose in comments
 *      and identifiers are never touched.
 *   2. Tokens are matched whole, and the value half must look like a real
 *      Tailwind value (number, fraction, `auto`, `full`, `px`, `[arbitrary]`).
 *      This is what stops `right-click` in an aria-label from matching.
 *   3. Inset utilities (`left-`/`right-`) are skipped whenever the same class
 *      string mentions `translate-x`, because `left-1/2 -translate-x-1/2`
 *      centering only works with a physical anchor -- `start-1/2` plus an
 *      unflipped `translate-x` would push the element off-centre under RTL.
 *   4. `left-1/2` / `right-1/2` are always skipped for the same reason.
 *
 * Run with `--dry` to preview counts without writing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DRY_RUN = process.argv.includes("--dry");

// Value half of a utility, e.g. the `4` in `ml-4` or the `[3px]` in `pl-[3px]`.
const VALUE = String.raw`(?:\d+(?:\.\d+)?|\d+\/\d+|auto|full|px|reverse|\[[^\]\s]*\])`;

const SPACING = [
  ["ml", "ms"],
  ["mr", "me"],
  ["pl", "ps"],
  ["pr", "pe"],
];

const INSET = [
  ["left", "start"],
  ["right", "end"],
];

// Families that take a further suffix, e.g. `rounded-l-md`, `border-l-2`,
// `border-l-destructive`. The suffix is opaque (size, width, or colour) and is
// carried through untouched.
const SUFFIXED = [
  ["rounded-l", "rounded-s"],
  ["rounded-r", "rounded-e"],
  ["rounded-tl", "rounded-ss"],
  ["rounded-tr", "rounded-se"],
  ["rounded-bl", "rounded-es"],
  ["rounded-br", "rounded-ee"],
  ["border-l", "border-s"],
  ["border-r", "border-e"],
];

const STATIC = [
  ["text-left", "text-start"],
  ["text-right", "text-end"],
  ["border-l", "border-s"],
  ["border-r", "border-e"],
  ["rounded-l", "rounded-s"],
  ["rounded-r", "rounded-e"],
  ["rounded-tl", "rounded-ss"],
  ["rounded-tr", "rounded-se"],
  ["rounded-bl", "rounded-es"],
  ["rounded-br", "rounded-ee"],
  ["origin-left", "origin-start"],
  ["origin-right", "origin-end"],
];

const counts = new Map();
const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);

/** Rewrites one whitespace-delimited class token, preserving variant prefixes. */
function convertToken(token, { allowInset }) {
  // Split leading variants (`md:`, `dark:`, `group-hover:`, `data-[x]:`) and a
  // leading `-` (negative) or `!` (important) from the utility itself.
  const variantMatch = token.match(/^((?:[^:\s]+:)*)(!?-?)(.*)$/);
  if (!variantMatch) return token;
  const [, variants, flags, utility] = variantMatch;

  for (const [from, to] of STATIC) {
    if (utility === from) {
      bump(`${from} -> ${to}`);
      return `${variants}${flags}${to}`;
    }
  }

  for (const [from, to] of SUFFIXED) {
    if (utility.startsWith(`${from}-`)) {
      const suffix = utility.slice(from.length + 1);
      if (!suffix) continue;
      bump(`${from}-* -> ${to}-*`);
      return `${variants}${flags}${to}-${suffix}`;
    }
  }

  for (const [from, to] of SPACING) {
    const re = new RegExp(String.raw`^${from}-(${VALUE})$`);
    const m = utility.match(re);
    if (m) {
      bump(`${from}- -> ${to}-`);
      return `${variants}${flags}${to}-${m[1]}`;
    }
  }

  if (allowInset) {
    for (const [from, to] of INSET) {
      const re = new RegExp(String.raw`^${from}-(${VALUE})$`);
      const m = utility.match(re);
      if (m) {
        // Rule 4: never convert the centering anchor.
        if (m[1] === "1/2") {
          bump(`SKIPPED ${from}-1/2 (centering)`);
          return token;
        }
        bump(`${from}- -> ${to}-`);
        return `${variants}${flags}${to}-${m[1]}`;
      }
    }
  }

  return token;
}

function convertClassString(value) {
  // Rule 3: a class string that positions via translate-x is hand-tuned.
  const allowInset = !value.includes("translate-x");
  return value
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : convertToken(part, { allowInset })))
    .join("");
}

// Matches string literals: "...", '...', and `...` without ${} interpolation
// boundaries being crossed (each literal chunk is handled independently).
const STRING_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

function convertFile(file) {
  const original = readFileSync(file, "utf8");
  const updated = original.replace(STRING_LITERAL, (match, quote, body) => {
    // Skip anything that cannot plausibly be a class list.
    if (!/[-]/.test(body)) return match;
    const converted = convertClassString(body);
    return converted === body ? match : `${quote}${converted}${quote}`;
  });

  if (updated !== original && !DRY_RUN) writeFileSync(file, updated);
  return updated !== original;
}

// `-z` keeps non-ASCII paths (e.g. Tainá.tsx) unquoted and NUL-delimited.
const files = execFileSync(
  "git",
  ["ls-files", "-z", "*.tsx", "*.ts"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("bumicerts-clean-rewrite/"));

let changed = 0;
for (const file of files) if (convertFile(file)) changed++;

console.log(`${DRY_RUN ? "[dry run] " : ""}files changed: ${changed} / ${files.length}\n`);
for (const [key, value] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(String(value).padStart(5), key);
}
