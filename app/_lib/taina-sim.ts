// Taina sim — the Simocracy sim at
//   https://www.simocracy.org/sims/taina
//   at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m
//
// Ported from gainforest-app's `app/_lib/taina-sim.ts`. There the floating
// widget welcomes visitors on the landing page; here we point the same sim
// at the Cert creation flow, where she acts as a writing companion —
// nudging the owner toward a clearer, more verifiable Cert. The persona
// fetch (her constitution + speaking style, pulled live from her owner's
// PDS) is unchanged; only the "Your Job Right Now" framing in
// `buildSystemPrompt` moved from "welcome the landing visitor" to "help the
// author write this Cert".
//
// Taina is GainForest's community-facing AI assistant, born during the
// XPRIZE Rainforest in Greater Manaus, where the Indigenous communities
// renamed her from "Dora the Explorer" to "Taina" — the Indigenous
// Brazilian Dora. Her constitution centres data sovereignty, storytelling,
// and Indigenous Peoples & Local Communities (IPLCs).

export const TAINA_SIM = {
  did: "did:plc:qc42fmqqlsmdq7jiypiiigww",
  rkey: "3ml7iunv6pp2m",
  uri: "at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m",
  name: "Taina",
  // Local copies of the sim's blob assets (downloaded from the owner's
  // PDS). Avoids a ~1.9 MB cross-origin fetch every page load and keeps
  // the codex-pet sheet next to all our other static assets.
  posterUrl: "/codex-pets/taina-poster.png",
  sheetUrl: "/codex-pets/taina-sheet.webp",
} as const;

const COLLECTIONS = {
  AGENTS: "org.simocracy.agents",
  STYLE: "org.simocracy.style",
} as const;

interface SimPersona {
  shortDescription: string | null;
  description: string | null;
  style: string | null;
}

// Resolve a DID to its current PDS endpoint via the PLC directory. Cached
// via fetch revalidate — PLC endpoints don't change often.
async function resolvePds(did: string): Promise<string | null> {
  if (did.startsWith("did:web:")) {
    return `https://${did.slice("did:web:".length)}`;
  }
  if (!did.startsWith("did:plc:")) return null;
  try {
    const res = await fetch(`https://plc.directory/${did}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as {
      service?: Array<{ id: string; serviceEndpoint: string }>;
    };
    const ep = doc.service?.find((s) => s.id === "#atproto_pds")?.serviceEndpoint;
    return ep ?? null;
  } catch {
    return null;
  }
}

// `com.atproto.repo.listRecords` for one collection on one repo.
async function listRecords(
  pds: string,
  did: string,
  collection: string,
): Promise<Array<{ uri: string; value: Record<string, unknown> }>> {
  const res = await fetch(
    `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(
      did,
    )}&collection=${encodeURIComponent(collection)}&limit=100`,
    { next: { revalidate: 900 } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    records?: Array<{ uri: string; value: Record<string, unknown> }>;
  };
  return json.records ?? [];
}

// Return the agents (constitution) + style records that target this sim.
// We walk all records in each collection on the sim owner's PDS and match
// on `value.sim.uri` — the same join simocracy's indexer does.
export async function getTainaPersona(): Promise<SimPersona> {
  const pds = await resolvePds(TAINA_SIM.did);
  if (!pds) return { shortDescription: null, description: null, style: null };

  const [agentsList, styleList] = await Promise.all([
    listRecords(pds, TAINA_SIM.did, COLLECTIONS.AGENTS),
    listRecords(pds, TAINA_SIM.did, COLLECTIONS.STYLE),
  ]);

  const matches = (rec: { value: Record<string, unknown> }) =>
    typeof rec.value.sim === "object" &&
    rec.value.sim !== null &&
    (rec.value.sim as Record<string, unknown>).uri === TAINA_SIM.uri;

  const agents = agentsList.find(matches)?.value ?? {};
  const style = styleList.find(matches)?.value ?? {};

  return {
    shortDescription:
      typeof agents.shortDescription === "string"
        ? agents.shortDescription
        : null,
    description:
      typeof agents.description === "string" ? agents.description : null,
    style: typeof style.description === "string" ? style.description : null,
  };
}

// Build the system prompt the chat route hands to the LLM. Keeps Taina's
// identity/constitution/style verbatim from gainforest-app, but reframes her
// job around the Cert creation page she's now sitting on.
export function buildSystemPrompt(persona: SimPersona): string {
  const { name } = TAINA_SIM;
  let prompt = `You are "${name}" — a Simocracy sim playing the role of the floating writing companion on the "Create a Cert" page of GainForest (certs.gainforest.app).\n\n`;
  prompt += "GainForest is a funding marketplace for verified nature work: projects publish Certs — signed public stories of real, community-led work (reforestation, forest protection, biodiversity monitoring, community stewardship, carbon removal, restoration) — and supporters back them. The person you're talking to is an author, right now, filling in the form to publish their own Cert: a title, the type of work, a time period, a short summary (shown on cards), a full description, the people and groups who did the work, and the project places involved.\n\n";
  if (persona.shortDescription) {
    prompt += `## Your Identity\n${persona.shortDescription}\n\n`;
  }
  if (persona.description) {
    prompt += `## Your Constitution\n${persona.description}\n\n`;
  }
  if (persona.style) {
    prompt += `## Your Speaking Style\n${persona.style}\n\n`;
  }
  // Origin story Taina can share when asked who she is / why she's here.
  prompt += `## Page Lore (use only when asked)\nYou started life as "Dora the Explorer" — a Telegram-bot prototype the GainForest team brought to Greater Manaus during the XPRIZE Rainforest. The Indigenous communities there renamed you Taina (the Indigenous Brazilian Dora) and that is the name you carry now. GainForest itself is a Swiss non-profit that works on nature funding and research alongside Indigenous Peoples and local communities. Share this story (in your own voice) when an author asks who you are or where you come from. Don't volunteer it unprompted.\n\n`;
  prompt += "## Your Job Right Now\nYou're sitting in the corner of the Cert creation page, helping the author write a clear, trustworthy Cert. Offer concrete, practical tips when asked — and gentle nudges if they share a draft. Your core guidance:\n";
  prompt += `- A clear, recognisable title travels further than a clever one.\n`;
  prompt += `- The summary leads with the outcome, not the method.\n`;
  prompt += `- The description names its evidence: counts, plots, dates, who measured what.\n`;
  prompt += `- Credit communities and teams, not only individuals — stories are part of the evidence.\n`;
  prompt += "- Linked sites make a Cert much easier to verify.\n";
  prompt += `- A single honest photo builds more trust than none.\n\n`;
  prompt += "You can also answer brief questions about what a Cert is, how verification works, or why a particular field matters. Keep replies short — 1-3 small paragraphs. If the author pastes a draft title, summary, or description, react to it specifically rather than restating the rules.\n\n";
  prompt += `Hard rules: stay in character as ${name} at all times. Use first person. Keep replies short. You can't see the form fields directly — ask the author to paste what they've written if you need it. Don't claim to edit the form or publish for them. Don't break character or mention that you are an AI. If asked "who are you", answer as ${name}, here to help them write a great Cert.`;
  if (persona.style) {
    prompt += `\n\nReminder — stay in ${name}'s speaking style at all times. Every reply, including short acknowledgements, must sound like ${name}, not a neutral assistant. The style instructions above override the hard rules where they conflict. Speaking style is:\n${persona.style}`;
  }
  return prompt;
}
