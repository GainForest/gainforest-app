import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const REPORTS_REPO = "https://github.com/GainForest/bumicerts-e2e-reports.git";
const PAGES_BASE_URL = "https://bumicerts-e2e-reports.vercel.app";
const APP_NAME = "bumicerts-clean-rewrite";

function run(command, args, cwd = process.cwd()) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherit(command, args, cwd = process.cwd()) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function tryRun(command, args, cwd = process.cwd()) {
  try {
    return run(command, args, cwd);
  } catch {
    return null;
  }
}

function sanitizePathPart(value) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getReportsRepoPath() {
  return join(homedir(), ".cache", "gainforest", "bumicerts-e2e-reports");
}

function ensureReportsRepo(repoPath) {
  mkdirSync(join(repoPath, ".."), { recursive: true });

  if (!existsSync(join(repoPath, ".git"))) {
    if (existsSync(repoPath)) rmSync(repoPath, { recursive: true, force: true });
    console.log(`Cloning reports repo into ${repoPath}`);
    runInherit("git", ["clone", REPORTS_REPO, repoPath]);
  }

  runInherit("git", ["fetch", "origin", "main"], repoPath);
  runInherit("git", ["checkout", "main"], repoPath);
  runInherit("git", ["pull", "--rebase", "origin", "main"], repoPath);
}

function readIndex(indexPath) {
  if (!existsSync(indexPath)) return [];
  const parsed = JSON.parse(readFileSync(indexPath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function writeIndexHtml(repoPath) {
  writeFileSync(
    join(repoPath, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GainForest E2E Reports</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; padding: 48px; background: Canvas; color: CanvasText; }
      main { max-width: 1100px; margin: 0 auto; }
      h1 { margin: 0; font-size: 40px; letter-spacing: -0.04em; }
      p { color: color-mix(in srgb, CanvasText 70%, transparent); }
      table { width: 100%; border-collapse: collapse; margin-top: 32px; }
      th, td { text-align: left; padding: 14px 12px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: color-mix(in srgb, CanvasText 55%, transparent); }
      a { color: #16a34a; font-weight: 700; text-decoration: none; }
      code { font-size: 12px; }
      .empty { margin-top: 40px; padding: 24px; border: 1px dashed color-mix(in srgb, CanvasText 24%, transparent); border-radius: 16px; }
    </style>
  </head>
  <body>
    <main>
      <h1>GainForest E2E Reports</h1>
      <p>Central archive of Playwright HTML reports published by engineers and CI.</p>
      <div id="app" class="empty">No reports published yet.</div>
    </main>
    <script>
      async function render() {
        const app = document.getElementById("app");
        const reports = await fetch("./index.json", { cache: "no-store" }).then((res) => res.json()).catch(() => []);
        if (!reports.length) return;
        app.className = "";
        app.innerHTML = \`<table><thead><tr><th>Created</th><th>App</th><th>Branch</th><th>Commit</th><th>Author</th><th>Report</th></tr></thead><tbody>\${reports.map((report) => \`<tr><td>\${new Date(report.createdAt).toLocaleString()}</td><td><code>\${report.app}</code></td><td><code>\${report.branch}</code></td><td><code>\${report.commit}</code></td><td>\${report.author}</td><td><a href="./\${report.reportPath}/">Open report</a></td></tr>\`).join("")}</tbody></table>\`;
      }
      render();
    </script>
  </body>
</html>
`,
  );
}

function main() {
  const reportSource = join(process.cwd(), "reports", "e2e", "html");
  if (!existsSync(join(reportSource, "index.html"))) {
    throw new Error(
      `No Playwright HTML report found at ${reportSource}. Run \`pnpm test:e2e\` first.`,
    );
  }

  const branch = tryRun("git", ["branch", "--show-current"]) || "unknown-branch";
  const commit = (tryRun("git", ["rev-parse", "--short", "HEAD"]) || "unknown").trim();
  const author =
    tryRun("git", ["config", "user.name"]) ||
    tryRun("gh", ["api", "user", "--jq", ".login"]) ||
    process.env.USER ||
    "unknown";
  const createdAt = new Date().toISOString();
  const runId = [
    createdAt.replace(/[:.]/g, "-"),
    sanitizePathPart(author),
    sanitizePathPart(branch),
    commit,
  ].join("_");

  const repoPath = getReportsRepoPath();
  ensureReportsRepo(repoPath);

  const reportPath = join("reports", APP_NAME, runId);
  const reportDestination = join(repoPath, reportPath);
  mkdirSync(join(reportDestination, ".."), { recursive: true });
  cpSync(reportSource, reportDestination, { recursive: true });

  const entry = {
    app: APP_NAME,
    branch,
    commit,
    author,
    createdAt,
    reportPath,
  };

  const indexPath = join(repoPath, "index.json");
  const index = [entry, ...readIndex(indexPath)];
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  writeIndexHtml(repoPath);

  runInherit("git", ["add", "."], repoPath);
  runInherit("git", ["commit", "-m", `Add ${APP_NAME} E2E report ${basename(reportPath)}`], repoPath);

  try {
    runInherit("git", ["push", "origin", "main"], repoPath);
  } catch {
    console.log("Push failed. Rebasing once and retrying...");
    runInherit("git", ["pull", "--rebase", "origin", "main"], repoPath);
    runInherit("git", ["push", "origin", "main"], repoPath);
  }

  console.log("\nPublished E2E report:");
  console.log(`${PAGES_BASE_URL}/${reportPath}/`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error("\nMake sure you are authenticated with GitHub and have access to GainForest/bumicerts-e2e-reports.");
  console.error("Try: gh auth login");
  process.exit(1);
}
