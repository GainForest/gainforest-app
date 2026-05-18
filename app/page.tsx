import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { ChoosePath } from "./_components/ChoosePath";
import { IWantTo } from "./_components/IWantTo";
import { HowItWorks } from "./_components/HowItWorks";
import { NatureCTA } from "./_components/NatureCTA";
import { Footer } from "./_components/Footer";
import { BumicertsCard } from "./_components/BumicertsCard";
import { DraggableGlobeCard } from "./_components/DraggableGlobeCard";
import { GlobeCard } from "./_components/GlobeCard";
import { fetchLiveBumicerts } from "./_lib/bumicerts";
import { fetchProjectPins } from "./_lib/projects";

// Re-fetch live Bumicerts at most every 15 minutes via the
// `next: { revalidate }` option in the GraphQL call. The page can be
// pre-rendered, then refreshed in the background as new projects land.
export const revalidate = 900;

export default async function Page() {
  const [snapshot, pins] = await Promise.all([
    fetchLiveBumicerts(12),
    fetchProjectPins(),
  ]);
  return (
    // `relative` so the two draggable cards can use `position: absolute`
    // anchored to the page wrapper. The wrapper spans the entire document
    // so the cards scroll with the rest of the content (and disappear off
    // the top of the screen as you scroll past them).
    <div className="relative min-h-screen bg-background">
      <TopNav />
      <main>
        <Hero
          snapshot={snapshot}
          // Mobile / tablet: inline live windows beneath the hero copy.
          // Hidden on lg+ where the floating, draggable versions take
          // over (rendered below outside the Hero).
          inlineCards={
            <>
              <DraggableGlobeCard pinCount={pins.length} inline>
                <GlobeCard diameter={250} caption={false} />
              </DraggableGlobeCard>
              <BumicertsCard snapshot={snapshot} inline />
            </>
          }
        />
        <ChoosePath snapshot={snapshot} />
        <IWantTo />
        <HowItWorks />
        <NatureCTA />
      </main>
      <Footer />
      {/* Desktop-only floating, draggable cards. Wrapped in a
          `hidden lg:block` div so they don't render on mobile where the
          inline siblings above take their place. Both use document-
          relative `position: absolute` so they scroll with the page. */}
      <div className="hidden lg:block">
        <BumicertsCard snapshot={snapshot} />
        {/* Globe diameter is tuned so:
            (1) the sphere nearly fills the (narrower, 280px) card body,
                leaving only a slim cream margin on each side; and
            (2) the card's total height (header 54 + body ~258 + footer 31
                ≈ 343 px) lands inside Bumicerts' ≈ 345 px height. */}
        <DraggableGlobeCard pinCount={pins.length}>
          <GlobeCard diameter={250} caption={false} />
        </DraggableGlobeCard>
      </div>
    </div>
  );
}
