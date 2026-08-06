import "server-only";

import { supabaseFilterValue, supabaseSelect } from "@/lib/supabase/rest";
import type { InvitationSendability, InvitationSourceReader } from "./types";

interface RawInvitationState {
  readonly status?: unknown;
  readonly expires_at?: unknown;
}

export class SupabaseInvitationSourceReader implements InvitationSourceReader {
  async getSendability(sourceId: string, now: Date): Promise<InvitationSendability> {
    try {
      const rows = await supabaseSelect<RawInvitationState>(
        `/cgs_group_invitations?select=status,expires_at&id=eq.${supabaseFilterValue(sourceId)}&limit=1`,
      );
      if (rows.length === 0) return { kind: "not_pending" };
      if (rows.length !== 1 || rows[0].status !== "pending" || typeof rows[0].expires_at !== "string") {
        return rows.length === 1 && rows[0].status !== "pending"
          ? { kind: "not_pending" }
          : { kind: "error" };
      }
      const expiresAt = new Date(rows[0].expires_at);
      if (Number.isNaN(expiresAt.getTime())) return { kind: "error" };
      return expiresAt <= now ? { kind: "expired" } : { kind: "sendable" };
    } catch {
      return { kind: "error" };
    }
  }
}
