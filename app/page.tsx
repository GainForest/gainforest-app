import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { AwardsStrip } from "./_components/AwardsStrip";
import { ChoosePath } from "./_components/ChoosePath";
import { DataCommons } from "./_components/DataCommons";
import { EquitableAI } from "./_components/EquitableAI";
import { TainaFeature } from "./_components/TainaFeature";
import { IWantTo } from "./_components/IWantTo";
import { HowItWorks } from "./_components/HowItWorks";
import { Research } from "./_components/Research";
import { NatureGuild } from "./_components/NatureGuild";
import { Partners } from "./_components/Partners";
import { ImpactReport } from "./_components/ImpactReport";
import { Media } from "./_components/Media";
import { Supporters } from "./_components/Supporters";
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

// Page composition (May 2026 gainforest.earth merge).
//
// We kept the team-loved core (Hero + Globe/Bumicerts windows,
// ChoosePath, IWantTo, HowItWorks, NatureCTA, Footer) intact, and merged
// in the rest of gainforest.earth's editorial sections. Order mirrors
// the upstream marketing site's narrative arc:
//
//   1.  Hero ........................ what GainForest is + live windows
//   2.  AwardsStrip ................. credibility band (XPRIZE etc.)
//   3.  ChoosePath .................. pick a tool surface
//   4.  DataCommons ................. WHY (1% biodiversity claim) — ink
//   5.  EquitableAI ................. open research pillars
//   6.  TainaFeature ................ Indigenous AI Assistant
//   7.  IWantTo ..................... visitor-routed paths
//   8.  HowItWorks .................. four-step explainer
//   9.  Research .................... hackathons
//  10.  NatureGuild ................. community members
//  11.  Partners ................... rotating live globe + partner ledger
//  12.  ImpactReport ............... 24/25 report card + community collage
//  13.  Media ...................... selected press
//  14.  Supporters ................. Merci
//  15.  NatureCTA .................. closing CTA — ink
//  16.  Footer ..................... legal + IBAN — ink
//
// Cream / ink rhythm: most sections sit on cream (`bg-background`) so
// the page reads as a long editorial scroll, with two intentional
// dark "punches" — DataCommons (mid-page WHY) and NatureCTA → Footer
// (the closing chord). ImpactReport used to be a third (a dark card,
// not a full band) but is now a warm apricot card mirroring
// gainforest.earth's treatment.
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
        <AwardsStrip />
        <ChoosePath snapshot={snapshot} />
        <DataCommons />
        <EquitableAI />
        <TainaFeature />
        <IWantTo />
        <HowItWorks />
        <Research />
        <NatureGuild />
        <Partners />
        <ImpactReport />
        <Media />
        <Supporters />
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
