# GainForest · Unlocking AI Opportunities for Climate Resilience

Self-contained static deck for GainForest's featured case study at
**Unlocking AI Opportunities for Climate Resilience**, a London Climate
Action Week session hosted by Klarna in partnership with Milkywire.

- Date: 23 June 2026, 13:00 BST
- Venue: "The View" at Sustainable Ventures, County Hall, London
- Speaker: Dr. David Dao (Co-Founder & Chief Scientist)

Forked from the `swissnex-2026` deck; same live-data pipeline and
keyboard shortcuts, with the event context refreshed and text trimmed.

Open `index.html` directly in a browser, or deploy as a static site
(Vercel auto-detects).

## Refreshing the live snapshots

The deck bakes its live data at build time so it works on conference
Wi-Fi.

```bash
# Last 14 days of high-quality Bumicerts from the GainForest indexer
node scripts/build-live-records.mjs

# Darwin Core species observations (Manaus / Amazonas)
node scripts/build-occurrences.mjs
```

Snapshots are written to `assets/live-records.json` and
`assets/occurrence-records.json`.

## Keyboard shortcuts

- `→` / `space` ; next slide
- `←` ; previous slide
- `home` / `end` ; first / last
- `f` ; toggle fullscreen

The opening **Listen** narrative is three slides after the title:

1. **listen** ("what is this sound?") ; `→` plays a 60-second
   AudioMoth field recording and a live scrolling spectrogram
   (`assets/forest-sound.m4a`, driven by a Web Audio `AnalyserNode`),
   and a second `→` advances. `space` / `↓` skip straight on.
2. **marina** ; the story (Marina Mura, our Indigenous scientist).
3. **howler** ; the reveal (Amazon black howler, *Alouatta
   nigerrima*).

The clip is played once, on the listen slide ; every other slide
stops it, so the sound never plays off-screen. To re-bake the audio
from a new source file:

```bash
ffmpeg -y -i source.flac -c:a aac -b:a 128k -ac 1 assets/forest-sound.m4a
```
