import { createHash } from "node:crypto";
import { after } from "next/server";
import { supabaseFilterValue, supabaseSelect, supabaseUpsert } from "@/lib/supabase/rest";
import { createWelcomeRuntime } from "@/lib/email-notifications/welcome-runtime";
import type { SupportedLanguageCode } from "@/lib/i18n/languages";
import type { AuthSession } from "./auth";

const WELCOME_DELIVERY_BUDGET_MS = 55_000;

export type UserEmail = {
  did: string;
  email: string;
  handle?: string;
};

export async function upsertUserEmail(input: UserEmail): Promise<{ firstUse: boolean }> {
  try {
    const did = input.did.trim();
    const existing = await supabaseSelect<{ did: string }>(
      `/user_emails?select=did&did=eq.${supabaseFilterValue(did)}&limit=1`,
    );
    await supabaseUpsert(
      "/user_emails",
      {
        did,
        email: input.email.trim().toLowerCase(),
        ...(input.handle ? { handle: input.handle.trim().toLowerCase() } : {}),
      },
      "did",
    );
    return { firstUse: existing.length === 0 };
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? `Supabase returned HTTP ${error.status}`
        : "The Supabase request could not be completed";
    throw new Error(
      `Could not sync the signed-in user's email: ${status}. Verify the user_emails table and Supabase service-role configuration.`,
    );
  }
}

export function scheduleUserEmailSync(session: AuthSession, locale?: SupportedLanguageCode): void {
  if (!session.isLoggedIn || !session.email) return;
  const { did, handle, email } = session;

  after(async () => {
    try {
      const { firstUse } = await upsertUserEmail({ did, handle, email });
      if (!firstUse) return;

      await createWelcomeRuntime().deliver({
        type: "signup",
        authEventId: `gainforest.first-use.v1:${createHash("sha256").update(did).digest("hex")}`,
        userDid: did,
        email,
        locale,
      }, new Date(Date.now() + WELCOME_DELIVERY_BUDGET_MS));
    } catch {
      console.error(
        "User email synchronization or first-use welcome setup failed. It will be retried only if the DID was not saved; verify Supabase and notification configuration.",
      );
    }
  });
}
