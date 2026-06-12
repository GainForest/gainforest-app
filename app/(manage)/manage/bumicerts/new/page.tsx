import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { NewBumicertSection } from "../../_sections";

export const metadata: Metadata = {
  title: "New Bumicert — Manage",
  description: "Create a new Bumicert.",
  robots: { index: false, follow: false },
};

type NewBumicertSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function NewBumicertPage({ searchParams }: { searchParams: NewBumicertSearchParams }) {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <NewBumicertSection target={target} searchParams={await searchParams} />;
}
