import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { ChoosePath } from "./_components/ChoosePath";
import { IWantTo } from "./_components/IWantTo";
import { HowItWorks } from "./_components/HowItWorks";
import { NatureCTA } from "./_components/NatureCTA";
import { Footer } from "./_components/Footer";
import { BumicertsCard } from "./_components/BumicertsCard";
import { fetchLiveBumicerts } from "./_lib/bumicerts";

// Re-fetch live Bumicerts at most every 15 minutes via the
// `next: { revalidate }` option in the GraphQL call. The page can be
// pre-rendered, then refreshed in the background as new projects land.
export const revalidate = 900;

export default async function Page() {
  const snapshot = await fetchLiveBumicerts(12);
  return (
    // `relative` so the draggable Bumicerts card can use `position: absolute`
    // anchored to the page wrapper. The wrapper spans the entire document so
    // the card scrolls with the rest of the content (and disappears off the
    // top of the screen as you scroll past it).
    <div className="relative min-h-screen bg-background">
      <TopNav />
      <main>
        <Hero snapshot={snapshot} />
        <ChoosePath snapshot={snapshot} />
        <IWantTo />
        <HowItWorks />
        <NatureCTA />
      </main>
      <Footer />
      {/* Bumicerts card is rendered OUTSIDE the Hero so it can use
          document-relative `position: absolute` without being clipped by
          Hero's `overflow-hidden`. It still defaults to the hero slot via
          the `#bumicerts-card-anchor` placeholder Hero renders. */}
      <BumicertsCard snapshot={snapshot} />
    </div>
  );
}
