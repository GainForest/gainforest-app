import "server-only";

import { createHash } from "node:crypto";
import { createBioblitzProcessRuntime, createBioblitzProducerRuntime } from "@/lib/email-notifications/bioblitz-runtime";
import type { BioblitzPrize, BioblitzWinnerInput } from "@/lib/email-notifications/bioblitz";
import type { ProcessOneOutcome } from "@/lib/email-notifications/orchestrator";
import { supabaseRpc, supabaseSelect } from "@/lib/supabase/rest";

export type BioblitzNotificationStatus =
  | "sent"
  | "delayed"
  | "missing_email"
  | "lookup_failed"
  | "cannot_send"
  | "handled_manually"
  | "not_prepared"
  | "notification_setup_failed";

export type BioblitzNotificationSummary = {
  status: BioblitzNotificationStatus;
  canMarkHandled: boolean;
};

type RawRow = { event_key_hash?: unknown; status?: unknown; last_error_code?: unknown; manual_handled_at?: unknown };
const sourceId = (roundId: number, prize: BioblitzPrize) => `bioblitz:${roundId}:${prize}`;

function fromRow(row: RawRow | undefined): BioblitzNotificationSummary {
  if (!row) return { status: "not_prepared", canMarkHandled: true };
  if (row.status === "sent") return { status: "sent", canMarkHandled: false };
  if (row.status === "suppressed" && typeof row.manual_handled_at === "string") return { status: "handled_manually", canMarkHandled: false };
  if (row.status === "waiting_recipient" && row.last_error_code === "recipient_missing") return { status: "missing_email", canMarkHandled: true };
  if (row.status === "waiting_recipient" && row.last_error_code === "recipient_lookup_failed") return { status: "lookup_failed", canMarkHandled: true };
  if (row.status === "dead") return { status: "cannot_send", canMarkHandled: true };
  return { status: "delayed", canMarkHandled: true };
}

export async function listBioblitzNotificationSummaries(
  awards: Array<{ roundId: number; prize: BioblitzPrize; winnerDid: string }>,
) {
  if (awards.length === 0) return new Map<string, BioblitzNotificationSummary>();
  const identities = awards.map(award => {
    const source = sourceId(award.roundId, award.prize);
    const eventKey = `bioblitz:${award.roundId}:${award.prize}:${award.winnerDid}`;
    return { source, hash: createHash("sha256").update(eventKey).digest("hex") };
  });
  const rows = await supabaseSelect<RawRow>(
    `/notification_outbox?select=event_key_hash,status,last_error_code,manual_handled_at&event_key_hash=in.(${identities.map(item => item.hash).join(",")})`,
  );
  const byHash = new Map(rows.flatMap(row => typeof row.event_key_hash === "string" ? [[row.event_key_hash, row] as const] : []));
  return new Map(identities.map(identity => [identity.source, fromRow(byHash.get(identity.hash))]));
}

function afterProcess(result: ProcessOneOutcome, recipientStatus: "ready" | "missing_email" | "lookup_failed"): BioblitzNotificationSummary {
  if (result.kind !== "processed") return { status: recipientStatus === "ready" ? "delayed" : recipientStatus, canMarkHandled: true };
  switch (result.result.kind) {
    case "sent": return { status: "sent", canMarkHandled: false };
    case "waiting_recipient": return { status: result.result.errorCode === "recipient_missing" ? "missing_email" : "lookup_failed", canMarkHandled: true };
    case "dead": return { status: "cannot_send", canMarkHandled: true };
    case "suppressed": return { status: "handled_manually", canMarkHandled: false };
    default: return { status: "delayed", canMarkHandled: true };
  }
}

export async function notifyBioblitzWinner(input: BioblitzWinnerInput, deadline: Date): Promise<BioblitzNotificationSummary> {
  try {
    const queued = await createBioblitzProducerRuntime().enqueue(input);
    if (queued.kind === "disabled") return { status: "notification_setup_failed", canMarkHandled: true };
    if (queued.status === "sent") return { status: "sent", canMarkHandled: false };
    if (queued.status === "suppressed") return { status: "handled_manually", canMarkHandled: false };
    if (queued.status === "dead") return { status: "cannot_send", canMarkHandled: true };
    try {
      const processed = await createBioblitzProcessRuntime().process(queued.outboxId, deadline);
      return afterProcess(processed, queued.recipientStatus);
    } catch {
      return { status: queued.recipientStatus === "ready" ? "delayed" : queued.recipientStatus, canMarkHandled: true };
    }
  } catch {
    return { status: "notification_setup_failed", canMarkHandled: true };
  }
}

export async function markBioblitzNotificationHandled(input: {
  roundId: number;
  prize: BioblitzPrize;
  winnerDid: string;
  moderatorDid: string;
}): Promise<BioblitzNotificationSummary> {
  try {
    const result = await supabaseRpc<unknown>("notification_bioblitz_mark_handled", {
      p_event_key: `bioblitz:${input.roundId}:${input.prize}:${input.winnerDid}`,
      p_moderator_did: input.moderatorDid,
    });
    if (typeof result !== "object" || result === null || (result as { status?: unknown }).status !== "suppressed") throw new Error("invalid response");
    return { status: "handled_manually", canMarkHandled: false };
  } catch {
    throw new Error("This notification could not be marked as handled. It may already be sending or sent.");
  }
}

export { sourceId as bioblitzNotificationSourceId };
