import { redirect } from "next/navigation";

export default async function LegacyAccountBumicertsPage({ params }: { params: Promise<{ did: string }> }) {
  const { did } = await params;
  redirect(`/account/${encodeURIComponent(did)}/certs`);
}
