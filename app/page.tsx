import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { ChoosePath } from "./_components/ChoosePath";
import { IWantTo } from "./_components/IWantTo";
import { HowItWorks } from "./_components/HowItWorks";
import { NatureCTA } from "./_components/NatureCTA";
import { Footer } from "./_components/Footer";
import { fetchLiveBumicerts } from "./_lib/bumicerts";

// Re-fetch live Bumicerts at most every 15 minutes via the
// `next: { revalidate }` option in the GraphQL call. The page can be
// pre-rendered, then refreshed in the background as new projects land.
export const revalidate = 900;

export default async function Page() {
  const snapshot = await fetchLiveBumicerts(12);
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main>
        <Hero snapshot={snapshot} />
        <ChoosePath snapshot={snapshot} />
        <IWantTo />
        <HowItWorks />
        <NatureCTA />
      </main>
      <Footer />
    </div>
  );
}
