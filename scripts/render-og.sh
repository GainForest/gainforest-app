#!/usr/bin/env bash
# Render `scripts/og-template.html` to `public/og/landing-YYYY-MM-DD.{png,jpg}`.
#
# The template embeds:
#   - real GainForest fonts (Cormorant Garamond, Instrument Serif, Inter
#     via the Google Fonts CDN — same families app/layout.tsx loads)
#   - the curved brush stroke under "Open" verbatim from Hero.tsx
#   - a real GainForest photograph on the right half
#     (public/data-commons/community-mangrove.webp by default)
#
# Headless Chrome renders the page at 2× scale and we down-sample to
# the canonical 1200×630 so the strokes stay crisp without blowing the
# file size out. The output JPG is what Telegram / Twitter pull when
# they hit the og:image URL.
#
# Re-run this whenever the hero copy, palette, or photo changes, then
# bump `OG_IMAGE_PATH` in app/layout.tsx so previously-shared previews
# get a fresh URL (most chat apps cache by URL, not by bytes).
#
# Usage:
#   scripts/render-og.sh                       # uses today's date
#   scripts/render-og.sh 2026-05-20            # explicit version date

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/scripts/og-template.html"
DATE="${1:-$(date +%Y-%m-%d)}"
OUT_DIR="${REPO_ROOT}/public/og"
OUT_BASE="${OUT_DIR}/landing-${DATE}"
TMP_HTML="$(mktemp -t og-render-XXXXXX).html"
TMP_PNG="$(mktemp -t og-render-XXXXXX).png"

# Locate Chrome. The headless-shell binary works too if Chrome isn't
# installed, but Chrome is what most macOS dev boxes already have.
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [[ ! -x "${CHROME}" ]]; then
  echo "Chrome not found at ${CHROME}; set CHROME=/path/to/chrome and retry." >&2
  exit 1
fi

# Inline absolute file:// paths into the template so headless Chrome
# can resolve the logo SVG + photograph from a `file://` origin.
PUBLIC="${REPO_ROOT}/public"
sed "s|__PUBLIC__|${PUBLIC}|g" "${TEMPLATE}" > "${TMP_HTML}"

"${CHROME}" \
  --headless=new \
  --hide-scrollbars \
  --no-sandbox \
  --disable-gpu \
  --force-device-scale-factor=2 \
  --window-size=1200,630 \
  --default-background-color=00000000 \
  --screenshot="${TMP_PNG}" \
  "file://${TMP_HTML}" > /dev/null 2>&1

mkdir -p "${OUT_DIR}"
magick "${TMP_PNG}" -resize 1200x630 -strip -quality 95 "${OUT_BASE}.png"
magick "${TMP_PNG}" -resize 1200x630 -strip -interlace Plane -quality 88 "${OUT_BASE}.jpg"

rm -f "${TMP_HTML}" "${TMP_PNG}"

echo "Wrote:"
ls -lh "${OUT_BASE}.png" "${OUT_BASE}.jpg"
echo
echo "Next: bump OG_IMAGE_PATH in app/layout.tsx to /og/landing-${DATE}.png"
