#!/usr/bin/env sh
# dev:proxy — local HTTPS proxy for GainForest development (Caddy).
#
# Idempotent boot: if a Caddy instance is already serving the same admin API
# (127.0.0.1:2019), we DON'T start a second one (that used to crash with
# "bind: address already in use"). Instead we just confirm it's up, reload the
# Caddyfile so the running proxy picks up any changes, and exit cleanly.
# If nothing is running, we boot Caddy and watch the config for edits.

CONFIG="${CONFIG:-Caddyfile}"
ADMIN="http://127.0.0.1:2019"

# Is a Caddy admin API already reachable? Plain TCP connect on the admin port.
# (curl --fail is unreliable here — Caddy's admin API may 401/403 without a token,
#  which reads as a network failure. A socket probe answers definitively.)
if curl --max-time 2 -s -o /dev/null "$ADMIN" >/dev/null 2>&1; then
  echo "dev:proxy: A Caddy is already running on $ADMIN."
  # Best-effort: push the current Caddyfile so the running proxy picks up edits.
  # May be refused if the admin API needs a token; that is non-fatal.
  curl --max-time 5 -sf -X POST "$ADMIN/config" \
    -H 'Content-Type: text/caddyfile' \
    --data-raw "$(cat "$CONFIG")" >/dev/null 2>&1 \
    && echo "dev:proxy: reloaded $CONFIG into the running Caddy." \
    || echo "dev:proxy: (could not push a reload; the running Caddy keeps its current config)"
  echo "dev:proxy: nothing to do — the HTTPS proxy is already up. Not starting a second copy."
  exit 0
fi

echo "dev:proxy: no Caddy running — booting with $CONFIG (watching for changes)."
caddy run --config "$CONFIG" --watch