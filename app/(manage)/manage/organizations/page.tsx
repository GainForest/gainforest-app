import type { Metadata } from "next";
import Container from "@/components/ui/container";
import { ManageGroupsClient } from "../groups/_components/ManageGroupsClient";

export const metadata: Metadata = {
  title: "My Organizations — GainForest",
  robots: { index: false, follow: false },
};

export default function ManageOrganizationsPage() {
  return (
    <Container className="pt-4 pb-8">
      <ManageGroupsClient />
    </Container>
  );
}
