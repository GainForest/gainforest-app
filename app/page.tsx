import { Hero } from "./_components/Hero";
import { BrowseGrid } from "./_components/BrowseGrid";
import { fetchKpis } from "./_lib/kpis";
import { fetchTrends } from "./_lib/trends";
import { fetchStatus } from "./_lib/status";
import { fetchDevicesSummary } from "./_lib/devices";

// Home. The editorial hero with the live KPI band, then a navigation grid of
// the six explorer surfaces. Both upstreams are cheap and cached via
// `revalidate`; the heavy record streams and tables live on their own routes.
export const revalidate = 300;

export default async function HomePage() {
  const [kpis, trends, status, devices] = await Promise.all([
    fetchKpis(),
    fetchTrends(),
    fetchStatus({ revalidate: 60 }),
    fetchDevicesSummary(),
  ]);

  return (
    <>
      <Hero kpis={kpis} trends={trends} status={status} devices={devices} />
      <BrowseGrid kpis={kpis} status={status} devices={devices} />
    </>
  );
}
