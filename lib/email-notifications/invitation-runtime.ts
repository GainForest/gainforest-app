import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseFilterValue, supabaseSelect } from "@/lib/supabase/rest";
import { InvitationNotificationRenderer } from "./invitation-renderer";
import { SupabaseInvitationSourceReader } from "./invitation-source";
import { createNotificationProcessor, processNotificationById } from "./orchestrator";
import { createNotificationRuntimeCore, rejectDisabledNotificationProcessing } from "./runtime";
import type { UserEmailReader } from "./types";

type Environment = Readonly<Record<string, string | undefined>>;
const WORKER_SAFETY_MARGIN_MS = 2_000;
// Keep ownership beyond the 60-second route limit so platform termination does
// not immediately allow a second provider call with an uncertain first result.
const PROCESSING_LEASE_SECONDS = 120;
const unusedUserEmailReader: UserEmailReader = { lookup: async () => ({ kind: "error" }) };

async function requireInvitationEvent(outboxId: string): Promise<void> {
  let rows: Array<{ event_type?: unknown }>;
  try {
    rows = await supabaseSelect<Array<{ event_type?: unknown }>[number]>(
      `/notification_outbox?select=event_type&id=eq.${supabaseFilterValue(outboxId)}&limit=1`,
    );
  } catch {
    throw new Error("Invitation notification type could not be verified. Check Supabase availability and try again.");
  }
  if (rows.length !== 1 || rows[0].event_type !== "invitation") {
    throw new Error("Invitation notification processing requires an existing invitation outbox row. Use the runtime registered for that event type.");
  }
}

export function createInvitationRuntime(environment: Environment = process.env) {
  const { config, repository, provider, clock, from } = createNotificationRuntimeCore(environment);
  const processor = provider
    ? createNotificationProcessor({
      from,
      repository,
      provider,
      renderer: new InvitationNotificationRenderer(),
      clock,
      userEmailReader: unusedUserEmailReader,
      invitationSourceReader: new SupabaseInvitationSourceReader(),
      safetyMarginMs: WORKER_SAFETY_MARGIN_MS,
    })
    : rejectDisabledNotificationProcessing;

  return {
    config,
    process: async (outboxId: string, invocationDeadline: Date) => {
      if (!config.emailDisabled) await requireInvitationEvent(outboxId);
      return processNotificationById(
        outboxId,
        invocationDeadline,
        { config, clock, repository, processor, tokenFactory: randomUUID },
        { leaseSeconds: PROCESSING_LEASE_SECONDS, safetyMarginMs: WORKER_SAFETY_MARGIN_MS },
      );
    },
  };
}
