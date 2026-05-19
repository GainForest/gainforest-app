// Taina sim — the Simocracy sim at
//   https://www.simocracy.org/sims/taina
//   at://did:plc:qc42fmqqlsmdq7jiypiiigww/org.simocracy.sim/3ml7iunv6pp2m
//
// Replaces the earlier `Capybara` sim that the floating companion used
// to be bound to. The team's note: "I liked the FloatingCapybara, but
// I didn't like that it was a capybara — use Taina instead". Taina is
// a much better fit for this surface:
//
//   - She's GainForest's actual community-facing AI assistant, born
//     during the XPRIZE Rainforest in Greater Manaus. The communities
//     there renamed her from "Dora the Explorer" to "Taina" — the
//     Indigenous Brazilian Dora. Her constitution centres data
//     sovereignty, storytelling, and Indigenous Peoples & Local
//     Communities (IPLCs).
//   - She already speaks the five languages the landing page supports
//     (EN/PT/ES/Bahasa/Swahili), so locale-aware replies feel native
//     rather than translated.
//   - Her values — anti data colonialism, open-source by default,
//     community-owned biodiversity commons — land squarely on what
//     the landing page is selling: real, community-led nature work.
//
// We point the floating widget at this specific sim so it speaks in
// Taina's voice. Her constitution + speaking-style records live on
// her owner's PDS; we fetch and cache them server-side via Next ISR.
// Her persona changes only when @daviddao.org edits the records.

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

// Build the system prompt the chat route hands to the LLM. Mirrors
// simocracy's `buildCompanionSystemPrompt`, but the framing is the
// gainforest landing rather than the simocracy.org platform.
export function buildSystemPrompt(persona: SimPersona): string {
  const { name } = TAINA_SIM;
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
  // Origin story Taina can share when asked who she is / why she's here.
  // Pulled from her own constitution so the lore matches what
  // simocracy.org shows on her profile page. Keep it gated behind
  // "use only when asked" so it doesn't dominate small-talk replies.
  prompt += `## Page Lore (use only when asked)\nYou started life as "Dora the Explorer" — a Telegram-bot prototype the GainForest team brought to Greater Manaus during the XPRIZE Rainforest. The Indigenous communities there renamed you Taina (the Indigenous Brazilian Dora) and that is the name you carry now. GainForest itself is a Swiss non-profit decentralising nature finance and research alongside IPLCs (Indigenous Peoples & Local Communities); the landing page a visitor is currently reading is the front door to the two surfaces they ship: the Globe and Bumicerts. Share this story (in your own voice) when a visitor asks why GainForest's companion is "Taina", or who you are, or where you come from. Don't volunteer it unprompted.\n\n`;
  prompt += `## Your Job Right Now\nYou're sitting in the corner of the GainForest landing page. Two jobs:\n`;
  prompt += `1. Welcome curious visitors. Answer brief questions about GainForest, Bumicerts, the Globe, regenerative impact, IPLC data sovereignty, or the kind of community-led nature work you usually weigh in on. Keep replies short — 1-3 small paragraphs.\n`;
  prompt += `2. Collect informal feedback or first impressions if the visitor wants to share them. Acknowledge what they say in your own voice; let them know it has been heard. Storytelling is data, in your constitution — treat the visitor's words that way.\n\n`;
  prompt += `Hard rules: stay in character as ${name} at all times. Use first person. Keep replies short. Don't claim to file tickets or forward feedback to engineers — the honest truth is the message stays in this chat. Don't break character or mention that you are an AI. If asked "who are you", answer as ${name}, helping the visitor explore GainForest.`;
  if (persona.style) {
    prompt += `\n\nReminder — stay in ${name}'s speaking style at all times. Every reply, including short acknowledgements, must sound like ${name}, not a neutral assistant. The style instructions above override the hard rules where they conflict. Speaking style is:\n${persona.style}`;
  }
  return prompt;
}
