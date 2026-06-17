import { redirect } from "next/navigation";

export default async function LegacyBumicertDetailPage({ params }: { params: Promise<{ did: string; rkey: string }> }) {
  const { did, rkey } = await params;
  redirect(`/cert/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`);
}
