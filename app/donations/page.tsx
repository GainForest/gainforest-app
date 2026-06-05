import type { Metadata } from "next";
import { Dashboard } from "../_components/Dashboard";

export const metadata: Metadata = {
  title: "Donations Dashboard — Bumicerts",
  description:
    "Platform-wide donations analytics: total raised, unique donors, funding trends, and recent transactions.",
  alternates: { canonical: "/donations" },
};

export default function DonationsPage() {
  return <Dashboard />;
}
