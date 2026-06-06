import type { Metadata } from "next";
import { BrowseGrid } from "./_components/BrowseGrid";
import { HomeLanding } from "./_components/HomeLanding";
import { fetchDevicesSummary } from "./_lib/devices";
import { fetchKpis } from "./_lib/kpis";
import { fetchStatus } from "./_lib/status";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Bumicerts — Fund Regenerative Impact",
  description:
    "Bumicerts connects funders with nature stewards doing on-ground regenerative work. Support checked environmental impact directly.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [kpis, status, devices] = await Promise.all([
    fetchKpis(),
    fetchStatus({ revalidate: 60 }),
    fetchDevicesSummary(),
  ]);

  return (
    <>
      <HomeLanding kpis={kpis} status={status} devices={devices} />
      <BrowseGrid kpis={kpis} status={status} devices={devices} />
    </>
  );
}
