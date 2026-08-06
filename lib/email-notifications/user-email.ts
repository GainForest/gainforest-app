import "server-only";

import { supabaseFilterValue, supabaseSelect } from "@/lib/supabase/rest";
import type { UserEmailReader, UserEmailLookup } from "./types";

export class SupabaseUserEmailReader implements UserEmailReader {
  async lookup(did: string): Promise<UserEmailLookup> {
    try {
      const rows = await supabaseSelect<{ email?: unknown }>(
        `/user_emails?select=email&did=eq.${supabaseFilterValue(did)}&limit=1`,
      );
      if (rows.length === 0) return { kind: "missing" };
      const email = typeof rows[0].email === "string" ? rows[0].email.trim().toLowerCase() : "";
      if (rows.length !== 1 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { kind: "error" };
      return { kind: "ready", email };
    } catch {
      return { kind: "error" };
    }
  }
}
