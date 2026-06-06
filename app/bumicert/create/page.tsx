import type { Metadata } from "next";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { CreateBumicertClient } from "./_components/CreateBumicertClient";

export const metadata: Metadata = {
  title: "Create Bumicert",
  description:
    "Create and publish a Bumicert impact story from GainForest.",
  robots: { index: false, follow: false },
};

export default async function CreateBumicertPage() {
  const session = await fetchAuthSession();
  return <CreateBumicertClient session={session} />;
}
