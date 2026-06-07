import type { Metadata } from "next";
import { Dashboard } from "../_components/Dashboard";

export const metadata: Metadata = {
  title: "Donations Overview — Bumicerts",
  description:
    "Donation activity across Bumicerts: total raised, supporters, funding trends, and recent donations.",
  alternates: { canonical: "/donations" },
};

export default function DonationsPage() {
  return <Dashboard />;
}
