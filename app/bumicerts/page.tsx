import type { Metadata } from "next";
import { BumicertsExploreClient } from "./BumicertsExploreClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explore Bumicerts — Verified Regenerative Impact Projects",
  description:
    "Browse verified environmental impact certificates from nature stewards around the world. Filter by country, organization, and impact area.",
  alternates: { canonical: "/bumicerts" },
};

export default function BumicertsPage() {
  return <BumicertsExploreClient />;
}
