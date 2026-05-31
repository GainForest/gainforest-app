import type { Metadata } from "next";
import { Dashboard } from "../_components/Dashboard";

export const metadata: Metadata = {
  title: "Donations dashboard",
  description:
    "Live on-chain donation analytics for the GainForest data commons; total raised, donors, per-organization breakdown, and recent transactions.",
  alternates: { canonical: "/donations" },
};

export default function DonationsPage() {
  return <Dashboard />;
}
