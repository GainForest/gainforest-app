import Link from "next/link";
import { fetchProjectPins } from "../_lib/projects";
import { GLOBE_HOST, GLOBE_URL } from "../_lib/urls";
import { LiveGlobe } from "./LiveGlobe";

const DEFAULT_DIAMETER = 380;

/**
 * Floating globe in the hero composition.
 *
 * No card chrome, no dark background — just the spherical earth (rendered by
 * `react-globe.gl`) on the cream page, with live project pins fetched from
 * data.gainforest.app's `/api/list-organizations` endpoint (same data the
 * production globe uses).
 *
 * Wrapped in a Link so a tap on the sphere opens the full live globe.
 */
export async function GlobeCard({
  diameter = DEFAULT_DIAMETER,
  caption = true,
  interactive = false,
}: {
  diameter?: number;
  caption?: boolean;
  /** Pass through to {@link LiveGlobe}. When true the globe accepts
   *  drag + zoom; default is a frozen decorative widget. */
  interactive?: boolean;
} = {}) {
  const pins = await fetchProjectPins();
  return (
    <div
      className="relative"
      style={{ width: diameter, height: diameter }}
    >
      <LiveGlobe pins={pins} diameter={diameter} interactive={interactive} />
      {caption && (
        <Link
          href={GLOBE_URL}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-foreground/45 transition-colors hover:text-foreground"
        >
          {GLOBE_HOST} · live globe →
        </Link>
      )}
    </div>
  );
}
