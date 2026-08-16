import { permanentRedirect } from "next/navigation";

/**
 * Device setup is no longer a peer of Photos and Audio.
 *
 * Those two are *explore* surfaces — they show what the whole network has
 * shared. The AudioMoth setup tool drives your own hardware over USB, so it
 * belongs with the rest of the personal recording workflow and now lives on
 * the Audio hub's Devices tab. This route only keeps old links and bookmarks
 * working.
 */
export default function ObservationsDevicesPage(): never {
  permanentRedirect("/observations/audio?tab=setup");
}
