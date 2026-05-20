import { ClientPartners } from "./PartnersClient";
import { fetchProjectPins } from "../_lib/projects";

// `Partners` is the server entry point for the "Working with nature
// stewards globally" section. It fetches the live project pins (same
// dataset the hero globe uses) and passes them to a client child that
// renders the LiveGlobe + editorial copy.
//
// Server/client split is necessary because react-globe.gl is
// dynamic-imported with `ssr: false` (three.js touches `window` during
// init), but the data fetch belongs on the server so the page-level
// `revalidate` cache covers it.
export async function Partners() {
  const pins = await fetchProjectPins();
  return <ClientPartners pins={pins} />;
}
