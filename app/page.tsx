import { Hero } from "./_components/Hero";
import { BrowseGrid } from "./_components/BrowseGrid";
import { fetchKpis } from "./_lib/kpis";
import { fetchStatus } from "./_lib/status";

// Home. The editorial hero with the live KPI band, then a navigation grid of
// the six explorer surfaces. Both upstreams are cheap and cached via
// `revalidate`; the heavy record streams and tables live on their own routes.
export const revalidate = 300;

export default async function HomePage() {
  const [kpis, status] = await Promise.all([
    fetchKpis(),
    fetchStatus({ revalidate: 60 }),
  ]);

  return (
    <>
      <Hero kpis={kpis} status={status} />
      <BrowseGrid kpis={kpis} status={status} />
    </>
  );
}
