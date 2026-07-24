import type { CgsServerRole } from "@/app/_lib/cgs-server";

/** Unknown or missing roles never grant moderation access. */
export function normalizeCgsRole(value: string | null | undefined): CgsServerRole | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}
