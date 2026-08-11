import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * AudioMoth is no longer a standalone destination: audio is a record type
 * inside Observations. The recording tabs moved to /observations/audio and
 * the USB setup tool to /observations/devices. This route only keeps old
 * links (and bookmarks) working.
 */
const AUDIO_TABS = new Set(["deployments", "upload", "label", "identifications", "soundscape"]);

export default async function AudioMothPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : undefined;
  if (tab && AUDIO_TABS.has(tab)) {
    redirect(`/observations/audio?tab=${encodeURIComponent(tab)}`);
  }
  redirect("/observations/devices");
}
