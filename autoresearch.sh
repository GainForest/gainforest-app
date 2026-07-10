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
CSM_OUTPUT_FILE=$(mktemp)
cleanup_check_site_meta() {
  if [ -n "${CSM_PID:-}" ]; then
    kill "$CSM_PID" 2>/dev/null || true
    wait "$CSM_PID" 2>/dev/null || true
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$PORT" | xargs -r kill 2>/dev/null || true
  fi
}
trap cleanup_check_site_meta EXIT
set +e
(yes n | DO_NOT_TRACK=true npx --yes check-site-meta "$TARGET" --port "$PORT" --no-analytics) >"$CSM_OUTPUT_FILE" 2>&1 &
CSM_PID=$!
for _ in 1 2 3 4 5 6 7 8; do
  if grep -q "Ready" "$CSM_OUTPUT_FILE"; then
    break
  fi
  sleep 1
done
cleanup_check_site_meta
set -e
CSM_OUTPUT=$(cat "$CSM_OUTPUT_FILE")
rm -f "$CSM_OUTPUT_FILE"
printf '%s\n' "$CSM_OUTPUT" | tail -30
if printf '%s\n' "$CSM_OUTPUT" | grep -q "Check Site Meta" && printf '%s\n' "$CSM_OUTPUT" | grep -q "Ready"; then
  echo "METRIC check_site_meta_ready=1"
else
  echo "METRIC check_site_meta_ready=0"
fi
