import { ClientPartners } from "./PartnersClient";
import { fetchPartnerOrgs } from "../_lib/partner-orgs";

// `Partners` is the server entry point for the "Working with nature
// stewards globally" section. It fetches the full Ma Earth + GainForest
// organization roster from the merged app's `/api/globe/organizations`
// route (see `_lib/partner-orgs.ts`) and passes it to a client child
// that renders the ported merged-app globe + editorial copy.
//
// Server/client split is necessary because maplibre-gl is
// dynamic-imported with `ssr: false` (the map touches `window` during
// init), but the data fetch belongs on the server so the page-level
// `revalidate` cache covers it.
export async function Partners() {
  const orgs = await fetchPartnerOrgs();
  return <ClientPartners orgs={orgs} />;
}
