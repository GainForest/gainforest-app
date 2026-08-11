import { permanentRedirect } from "next/navigation";

/**
 * The soundscape clock is part of the AudioMoth tool, so it now lives as a tab
 * there instead of a page of its own. This keeps any old link working; the
 * AudioMoth page re-checks admin access before it shows the tab.
 */
export default function SoundscapePage() {
  permanentRedirect("/observations/audio?tab=soundscape");
}
