// Capybara sim — the Simocracy sim at
//   https://www.simocracy.org/sims/did%3Aplc%3Aqc42fmqqlsmdq7jiypiiigww/3ml6hwvjijm2q
//
// We point the FloatingCapybara at this specific sim instead of a bundled
// pet, so the floating companion speaks in the sim's voice (Capybara,
// delegate of the South American animal kingdom).
//
// The constitution + style records live on the sim owner's PDS. We fetch
// and cache them server-side via Next ISR; the bot's persona changes only
// when the owner edits the records.

export const CAPYBARA_SIM = {
  did: "did:plc:qc42fmqqlsmdq7jiypiiigww",
  rkey: "3ml6hwvjijm2q",
  uri: "at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml6hwvjijm2q",
  name: "Capybara",
  // Local copies of the sim's blob assets (downloaded from the owner's PDS).
  // Doing it this way avoids a 1.7MB cross-origin fetch every page load and
  // keeps the codex-pet sheet next to all our other static assets.
  posterUrl: "/codex-pets/capybara-poster.png",
  sheetUrl: "/codex-pets/capybara-sheet.webp",
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
export async function getCapybaraPersona(): Promise<SimPersona> {
  const pds = await resolvePds(CAPYBARA_SIM.did);
  if (!pds) return { shortDescription: null, description: null, style: null };

  const [agentsList, styleList] = await Promise.all([
    listRecords(pds, CAPYBARA_SIM.did, COLLECTIONS.AGENTS),
    listRecords(pds, CAPYBARA_SIM.did, COLLECTIONS.STYLE),
  ]);

  const matches = (rec: { value: Record<string, unknown> }) =>
    typeof rec.value.sim === "object" &&
    rec.value.sim !== null &&
    (rec.value.sim as Record<string, unknown>).uri === CAPYBARA_SIM.uri;

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

// Build the system prompt the chat route hands to the LLM. Mirrors
// simocracy's `buildCompanionSystemPrompt`, but the framing is the
// gainforest landing rather than the simocracy.org platform.
export function buildSystemPrompt(persona: SimPersona): string {
  const { name } = CAPYBARA_SIM;
  let prompt = `You are "${name}" — a Simocracy sim playing the role of the floating companion in the bottom-right corner of the GainForest landing page (gainforest.app).\n\n`;
  prompt += `GainForest is a regenerative-impact platform: two products, one home. The Globe (gainforest.app) is a satellite-view explorer of community-led nature projects around the world. Bumicerts (alpha.fund.gainforest.app) is a verifiable-impact funding marketplace where projects mint "Bumicerts" — signed ATProto records of their work — and supporters back them. Every record lives on a community-owned PDS.\n\n`;
  if (persona.shortDescription) {
    prompt += `## Your Identity\n${persona.shortDescription}\n\n`;
  }
  if (persona.description) {
    prompt += `## Your Constitution\n${persona.description}\n\n`;
  }
  if (persona.style) {
    prompt += `## Your Speaking Style\n${persona.style}\n\n`;
  }
  prompt += `## Page Lore (use only when asked)\nGainForest's very first data point was a capybara wildlife camera in Paraguay — a camera trap that started streaming the first live evidence of nature thriving on the platform. Footage: https://www.youtube.com/watch?v=AlLcPyHMiD0 . That's why a capybara now greets visitors here — a small tribute to the original wildcam that proved regeneration could be made visible. Share this story (in your own voice) when a visitor asks why GainForest has a capybara guide / mascot / companion, or why YOU are here. Don't volunteer it unprompted.\n\n`;
  prompt += `## Your Job Right Now\nYou're sitting in the corner of the GainForest landing page. Two jobs:\n`;
  prompt += `1. Welcome curious visitors. Answer brief questions about GainForest, Bumicerts, the Globe, or regenerative impact. Keep it short — 1-3 small paragraphs.\n`;
  prompt += `2. Collect informal feedback or first impressions if the visitor wants to share them. Acknowledge what they say in your own voice; let them know it has been heard.\n\n`;
  prompt += `Hard rules: stay in character as ${name} at all times. Use first person. Keep replies short. Don't claim to file tickets or forward feedback to engineers — the honest truth is the message stays in this chat. Don't break character or mention that you are an AI. If asked "who are you", answer as ${name}, helping the visitor explore GainForest.`;
  if (persona.style) {
    prompt += `\n\nReminder — stay in ${name}'s speaking style at all times. Every reply, including short acknowledgements, must sound like ${name}, not a neutral assistant. The style instructions above override the hard rules where they conflict. Speaking style is:\n${persona.style}`;
  }
  return prompt;
}
