import { redirect } from "next/navigation";

export default async function LegacyBumicertIdPage({ params }: { params: Promise<{ did: string }> }) {
  const { did } = await params;
  redirect(`/cert/${encodeURIComponent(did)}`);
}
