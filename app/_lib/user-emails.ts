import { after } from "next/server";
import { supabaseUpsert } from "@/lib/supabase/rest";
import type { AuthSession } from "./auth";

export type UserEmail = {
  did: string;
  email: string;
};

export async function upsertUserEmail(input: UserEmail): Promise<void> {
  try {
    await supabaseUpsert(
      "/user_emails",
      {
        did: input.did.trim(),
        email: input.email.trim().toLowerCase(),
      },
      "did",
    );
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

export function scheduleUserEmailSync(session: AuthSession): void {
  if (!session.isLoggedIn || !session.email) return;
  const { did, email } = session;

  after(async () => {
    try {
      await upsertUserEmail({ did, email });
    } catch {
      console.error(
        "User email synchronization failed; it will be retried on a later full app load. Verify the user_emails table and Supabase service-role configuration.",
      );
    }
  });
}
