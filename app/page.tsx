import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { AwardsStrip } from "./_components/AwardsStrip";
import { ChoosePath } from "./_components/ChoosePath";
import { HowItWorks } from "./_components/HowItWorks";
import { DataCommons } from "./_components/DataCommons";
import { EquitableAI } from "./_components/EquitableAI";
import { TainaFeature } from "./_components/TainaFeature";
import { Research } from "./_components/Research";
import { NatureGuild } from "./_components/NatureGuild";
import { Partners } from "./_components/Partners";
import { ImpactReport } from "./_components/ImpactReport";
import { Media } from "./_components/Media";
import { Supporters } from "./_components/Supporters";
import { Footer } from "./_components/Footer";
import { BumicertsCard } from "./_components/BumicertsCard";
import { DraggableGlobeCard } from "./_components/DraggableGlobeCard";
import { GlobeCard } from "./_components/GlobeCard";
import { fetchLiveBumicerts } from "./_lib/bumicerts";
import { fetchProjectPins } from "./_lib/projects";
import { fetchSubstackPosts } from "./_lib/blog";

// Re-fetch live Bumicerts at most every 15 minutes via the
// `next: { revalidate }` option in the GraphQL call. The page can be
// pre-rendered, then refreshed in the background as new projects land.
export const revalidate = 900;

// Page composition (May 2026 — narrative-flow pass).
//
// Audit feedback called out two structural issues with the prior
// ordering: the page didn't explain what a Bumicert IS before asking
// the visitor to "Choose a path", and the sequence jumped between
// route pickers (ChoosePath / IWantTo) and explainers (DataCommons /
// HowItWorks / EquitableAI) without a coherent thread. The new order
// reads as a single narrative:
//
//   1.  Hero ........................ promise + live data windows
//   2.  AwardsStrip ................. credibility (logo wall now)
//   3.  ChoosePath .................. WHAT — pick a surface, see a real
//                                     Bumicert preview, learn what
//                                     a Bumicert actually is
//   4.  HowItWorks .................. HOW — four-step flow (moved
//                                     up so the explanation lands
//                                     immediately after the Bumicert
//                                     preview)
//   5.  DataCommons ................. WHY — 1% biodiversity claim
//                                     (ink band)
//   6.  EquitableAI ................. THE TECH — three research pillars
//   7.  TainaFeature ................ THE SHOWCASE — Indigenous AI
//                                     assistant
//   8.  Research .................... HACKATHONS — how we iterate
//   9.  NatureGuild ................. THE COMMUNITY — Guild members
//  10.  Partners ................... live globe + community spotlight
//  11.  ImpactReport ............... 24/25 report card
//  12.  Media ...................... selected press
//  13.  Supporters ................. Merci to our supporters
//  14.  Footer ..................... merged closing CTA + legal (ink)
//
// Dropped: <IWantTo /> — it was a second visitor-routing strip with
// four cards (Discover / Browse / Create / Learn) that duplicated
// ChoosePath conceptually. The four "routes" are already covered by
// the hero CTAs (Explore Bumicerts + Open the Globe), the ChoosePath
// section (with the Bumicert preview), and the HowItWorks four-step
// flow. Removing it tightens the narrative without losing any
// destination — every link in IWantTo still has at least one path on
// the page.
//
// Cream / ink rhythm: most sections sit on cream so the page reads as
// a long editorial scroll, with two intentional dark "punches" —
// DataCommons (mid-page WHY) and the integrated closing Footer.
export default async function Page() {
  const [snapshot, pins, blogPosts] = await Promise.all([
    fetchLiveBumicerts(12),
    fetchProjectPins(),
    fetchSubstackPosts(3),
  ]);
  return (
    <div id="top" className="min-h-screen bg-background">
      <TopNav />
      <main>
        <Hero
          snapshot={snapshot}
          // Mobile / tablet (< lg): inline live windows beneath the hero
          // copy. Hidden on lg+ where the desktopCards take over.
          inlineCards={
            <>
              <DraggableGlobeCard pinCount={pins.length} inline>
                <GlobeCard diameter={250} caption={false} />
              </DraggableGlobeCard>
              <BumicertsCard snapshot={snapshot} inline />
            </>
          }
          // Desktop (lg+): live windows render inside the Hero's right
          // column with column-relative absolute positioning. The
          // earlier document-coordinate variant drifted to the page's
          // left edge at non-100% browser zoom; this anchors them to
          // the column instead so they stay put at any zoom level.
          desktopCards={
            <>
              <BumicertsCard
                snapshot={snapshot}
                position={{ top: 140, left: 0, width: 400 }}
              />
              {/* Globe diameter is tuned so:
                  (1) the sphere nearly fills the (narrower, 280px)
                      card body, leaving only a slim cream margin
                      on each side; and
                  (2) the card's total height (header 54 + body
                      ~258 + footer 31 ≈ 343 px) lands inside
                      Bumicerts' ≈ 345 px height. */}
              <DraggableGlobeCard
                pinCount={pins.length}
                position={{ top: 20, right: -35, width: 280 }}
              >
                <GlobeCard diameter={250} caption={false} />
              </DraggableGlobeCard>
            </>
          }
        />
        <AwardsStrip />
        <ChoosePath snapshot={snapshot} />
        <HowItWorks />
        <DataCommons />
        <EquitableAI />
        <TainaFeature />
        <Research />
        <NatureGuild />
        <Partners />
        <ImpactReport />
        <Media blogPosts={blogPosts} />
        <Supporters />
      </main>
      <Footer />
    </div>
  );
}
