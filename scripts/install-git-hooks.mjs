#!/usr/bin/env node
/**
 * Wire `core.hooksPath` to the versioned `.githooks/` directory so the repo's
 * pre-commit hook runs on every `git commit` without each contributor having
 * to copy files into `.git/hooks/` themselves.
 *
 * Triggered by the `prepare` lifecycle script in package.json, which npm /
 * pnpm / yarn all run automatically after `install`. Safe to run repeatedly.
 *
 * Skipped when:
 *   - There is no `.git` directory at the repo root (e.g. shallow Vercel
 *     build environment, GitHub Actions checkout without --tags, npm packing).
 *   - The `CI` environment variable is set (CI doesn't make commits).
 *
 * To bypass the hook for a single commit, use `git commit --no-verify`.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

if (process.env.CI) {
  // CI doesn't need git hooks. Stay quiet.
  process.exit(0);
}

if (!existsSync(path.join(REPO_ROOT, ".git"))) {
  // Most likely we're being installed into a node_modules folder of another
  // project, or running in a packed-tarball environment.
  process.exit(0);
}

const hooksDir = path.join(REPO_ROOT, ".githooks");
if (!existsSync(hooksDir)) {
  console.warn("install-git-hooks: .githooks/ not found, skipping");
  process.exit(0);
}

const res = spawnSync(
  "git",
  ["config", "--local", "core.hooksPath", ".githooks"],
  { cwd: REPO_ROOT, stdio: "inherit" }
);

if (res.status !== 0) {
  console.warn(
    "install-git-hooks: failed to set core.hooksPath; commit hooks won't run automatically."
  );
  process.exit(0);
}
