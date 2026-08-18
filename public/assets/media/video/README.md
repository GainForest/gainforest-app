# Landing videos

Three optional ambient clips power the landing. Each one needs **both** a
`.webm` and `.mp4` so every browser has a playable source. Until they exist,
the matching section gracefully shows its poster image, so the page looks
exactly like before — safe to ship without the clips.

| Slot | Files here | Poster fallback | Used by |
|------|------------|-----------------|---------|
| Hero | `hero-biodiversity.{webm,mp4}` | `images/landing/hero-rainforest@2x.webp` | `HomeLanding` → `LandingHero` |
| Funders card | `card-funders.{webm,mp4}` | `images/landing/supporter-river.jpg` | `HomeLanding` → `OptionCard` |
| Organizations card | `card-organizations.{webm,mp4}` | `images/landing/steward-waterfall.jpg` | `HomeLanding` → `OptionCard` |

## Easiest workflow (manual download + I encode)

1. Download the raw mp4 from the source (e.g. Pexels "Free Download", HD is
   plenty) and drop the three raws into `public/assets/media/video/_raw/` as:
   - `hero.mp4`
   - `funders.mp4`
   - `organizations.mp4`
2. The trim + encode is then run for you (see snippet below) to produce the
   small final `*.webm` + `*.mp4` in this folder. `_raw/` is gitignored and is
   never shipped.

## Guidance (matches the iNaturalist hero we took inspiration from)

- **Muted, autoplaying, looping, decorative** (`aria-hidden`). Autoplay
  requires `muted` + `playsinline`.
- **Short + ambient**: ~8-15s, slow movement, no hard cuts, no captions/UI so
  the headline + card copy stay readable.
- **Small**: target < ~3 MB per file. Cards crop with `object-cover`, so a
  16:9 clip is fine.

```sh
# run from public/assets/media/video
trim() {  # trim() <in> <out-basename> <seconds>
  ffmpeg -y -ss 0 -t "${3:-12}" -i "$1" -an -vf "scale=1600:-2,fps=24" \
    -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p -movflags +faststart "$2.mp4"
  ffmpeg -y -ss 0 -t "${3:-12}" -i "$1" -an -vf "scale=1600:-2,fps=24" \
    -c:v libvpx-vp9 -b:v 0 -crf 33 "$2.webm"
  ffmpeg -y -ss 2 -i "$1" -frames:v 1 -vf "scale=1600:-2" "$2-poster.webp"
}
trim _raw/hero.mp4 hero-biodiversity 14
trim _raw/funders.mp4 card-funders 12
trim _raw/organizations.mp4 card-organizations 12
```
