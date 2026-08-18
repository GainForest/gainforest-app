// Generates app/changelog/changelog-data.json from the git history.
// Run manually after notable work: `node scripts/generate-changelog.mjs`.
// The changelog page reads the committed JSON, so it works without git at
// build/runtime (e.g. on Vercel).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "app", "changelog", "changelog-data.json");

const SEP = "\u001f"; // unit separator between fields
const REC = "\u001e"; // record separator between commits
const raw = execSync(`git log --no-merges --pretty=format:"%H${SEP}%ad${SEP}%an${SEP}%s${REC}" --date=short`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

// Category detection from the subject line. Order matters — first match wins.
const CATEGORIES = [
  { key: "taina", label: "Tainá", test: /tain[áa]|telegram/i },
  { key: "dataJobs", label: "Data batches", test: /data batch|data job|partner (upload|batch)|bulk ingest|kobo/i },
  { key: "donations", label: "Donations", test: /donat|checkout|cart|tip|wallet|payment/i },
  { key: "observations", label: "Observations", test: /observation|bioblitz|species|sighting/i },
  { key: "projects", label: "Projects", test: /project|organization|\borg\b|steward/i },
  { key: "auth", label: "Accounts & auth", test: /auth|login|oauth|session|account|sign[- ]?in|epds|pds|did|agent key/i },
  { key: "admin", label: "Admin & moderation", test: /admin|moderat|facilitator|endors|review queue/i },
  { key: "i18n", label: "Localization", test: /translat|i18n|locale|language/i },
  { key: "ui", label: "UI & design", test: /footer|sidebar|header|card|page|layout|hero|design|polish|theme|dark mode|banner|logo|art|icon/i },
  { key: "fix", label: "Fixes", test: /fix|bug|revert|hotfix|regress|patch/i },
];

function categorize(subject) {
  for (const c of CATEGORIES) {
    if (c.test.test(subject)) return c;
  }
  return { key: "core", label: "Core & platform" };
}

const commits = raw
  .split(REC)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((line) => {
    const [hash, date, author, subject] = line.split(SEP);
    const cat = categorize(subject);
    return { hash: hash.slice(0, 7), date, author, subject, category: cat.key, categoryLabel: cat.label };
  });

// Group into months, newest first.
const monthsMap = new Map();
for (const c of commits) {
  const month = c.date.slice(0, 7); // YYYY-MM
  if (!monthsMap.has(month)) monthsMap.set(month, []);
  monthsMap.get(month).push(c);
}

const months = [...monthsMap.entries()]
  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
  .map(([month, list]) => {
    const counts = {};
    for (const c of list) counts[c.category] = (counts[c.category] ?? 0) + 1;
    return { month, count: list.length, counts, commits: list };
  });

const categoryList = [...CATEGORIES.map((c) => ({ key: c.key, label: c.label })), { key: "core", label: "Core & platform" }];

const data = {
  generatedAt: new Date().toISOString(),
  version: JSON.parse(execSync("cat package.json", { encoding: "utf8" })).version,
  total: commits.length,
  firstDate: commits.at(-1)?.date ?? null,
  lastDate: commits.at(0)?.date ?? null,
  categories: categoryList,
  months,
};

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${commits.length} commits across ${months.length} months to ${OUT}`);
