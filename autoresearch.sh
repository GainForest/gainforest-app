#!/bin/bash
set -euo pipefail

# Fast, deterministic technical SEO proxy metric for local iterations.
node scripts/seo-audit.mjs

# User-requested manual metadata preview tool. check-site-meta is an interactive
# long-running UI, so in CI/agent mode we start it with a preselected "no browser"
# answer, wait long enough to prove it boots with the target URL, then let the
# alarm terminate it. The primary score comes from the deterministic audit above.
TARGET="${CHECK_SITE_META_TARGET:-https://www.gainforest.app}"
PORT="${CHECK_SITE_META_PORT:-3050}"
set +e
CSM_OUTPUT=$(perl -e 'alarm shift; exec @ARGV' 8 bash -lc "yes n | DO_NOT_TRACK=true npx --yes check-site-meta '$TARGET' --port '$PORT' --no-analytics" 2>&1)
CSM_STATUS=$?
set -e
printf '%s\n' "$CSM_OUTPUT" | tail -30
if printf '%s\n' "$CSM_OUTPUT" | grep -q "Check Site Meta" && printf '%s\n' "$CSM_OUTPUT" | grep -q "Ready"; then
  echo "METRIC check_site_meta_ready=1"
else
  echo "METRIC check_site_meta_ready=0"
fi
# Exit successfully when the only failure is the expected alarm kill of the
# long-running check-site-meta UI after it has become ready.
if [ "$CSM_STATUS" -ne 0 ] && [ "$CSM_STATUS" -ne 142 ]; then
  exit "$CSM_STATUS"
fi
