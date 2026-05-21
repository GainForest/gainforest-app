import { GlobeCard } from "./GlobeCard";
import { ChoosePathLabels } from "./ChoosePathLabels";
import { ChoosePathClient } from "./ChoosePathClient";
import type { LiveBumicertsSnapshot } from "../_lib/bumicerts";
import { fetchProjectPins } from "../_lib/projects";

// "Choose how you want to use GainForest" — two editorial cards
// side-by-side. Each card explains AND demonstrates one of the two
// surfaces GainForest hosts:
//
//   ┌──────────────────────┐   ┌──────────────────────┐
//   │ Open the Globe       │   │ What's a Bumicert?   │
//   │ ─ live spinning ─    │   │ — featured trio —    │
//   │   body copy          │   │   Bumicert cards     │
//   │   Open the Globe →   │   │   Explore Bumicerts →│
//   └──────────────────────┘   └──────────────────────┘
//
// All visible strings flow through i18n. The component is still a
// server component because it does two async fetches: the project
// pin count for the globe caption, and pre-rendering the async
// <GlobeCard> so its `await fetchProjectPins()` happens once. The
// rendered JSX lives in <ChoosePathClient />, a client component
// that reads the active locale and renders every label through
// useT().
export async function ChoosePath({
  snapshot,
}: {
  snapshot: LiveBumicertsSnapshot;
}) {
  const pins = await fetchProjectPins();

  // Featured trio for the right card. fetchLiveBumicerts() returns
  // high-quality Bumicerts sorted by createdAt DESC, so preserving
  // order keeps the trio recent. Prefer rows with image + non-trivial
  // description, then image-only rows. Dedupe in case the two passes
  // overlap.
  const withImageAndDescription = snapshot.bumicerts.filter(
    (b) => b.imageUrl && b.shortDescription && b.shortDescription.length > 20,
  );
  const withImage = snapshot.bumicerts.filter((b) => b.imageUrl);
  const featured = Array.from(
    new Map(
      [...withImageAndDescription, ...withImage].map((b) => [b.id, b]),
    ).values(),
  )
    .slice(0, 3)
    .map((b) => ({
      id: b.id,
      title: b.title,
      imageUrl: b.imageUrl,
      shortDescription: b.shortDescription,
      href: b.href,
    }));

  return (
    <section id="tools" className="scroll-mt-20 border-t border-border-soft lg:scroll-mt-24">
      <div className="mx-auto w-full max-w-[1280px] px-6 pt-16 pb-16 sm:px-10 lg:px-16 lg:pt-20 lg:pb-20">
        <ChoosePathLabels slot="heading" />

        <ChoosePathClient
          featured={featured}
          pinCount={pins.length}
          isLive={!snapshot.fromFallback}
          globe={<GlobeCard diameter={240} caption={false} interactive />}
        />
      </div>
    </section>
  );
}
