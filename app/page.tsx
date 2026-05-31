import { TopNav } from "./_components/TopNav";
import { Hero } from "./_components/Hero";
import { ExplorerTabs } from "./_components/ExplorerTabs";
import { Dashboard } from "./_components/Dashboard";
import { StatusSection } from "./_components/StatusSection";
import { Footer } from "./_components/Footer";
import { fetchKpis } from "./_lib/kpis";
import { fetchStatus } from "./_lib/status";

// Server shell. Two cheap prefetches flow in at request time:
//   • fetchKpis()   → indexer totalCounts + raised total for the hero band.
//   • fetchStatus() → instatus summary + components for the nav/hero pill and
//                     the seed of the live status board.
// Both are cached via Next's `revalidate`, so the shell stays out of the
// per-request hot path. The heavy record streams and donation tables fetch
// client-side (CORS-open indexer) so the page paints instantly.
export const revalidate = 300;

export default async function ExplorerPage() {
  const [kpis, status] = await Promise.all([
    fetchKpis(),
    fetchStatus({ revalidate: 60 }),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <TopNav status={status} />
      <main>
        <Hero kpis={kpis} status={status} />
        <ExplorerTabs />
        <Dashboard />
        <StatusSection initial={status} />
      </main>
      <Footer />
    </div>
  );
}
