export type GrantApplicationAccount =
  | { type: "signedOut" }
  | { type: "personal" }
  | {
      type: "group";
      accountListStatus: "idle" | "loading" | "ready" | "error";
      membershipRole: string | null;
    };

export type GrantApplicationPermission = "signIn" | "loading" | "allowed" | "denied";

/**
 * The client account switcher is advisory UI state. A group application is
 * offered only after the current membership list confirms a known role; the
 * publishing service remains responsible for authoritative authorization.
 */
export function grantApplicationPermission(account: GrantApplicationAccount): GrantApplicationPermission {
  if (account.type === "signedOut") return "signIn";
  if (account.type === "personal") return "allowed";
  if (account.accountListStatus === "loading" || account.accountListStatus === "idle") return "loading";
  if (account.accountListStatus !== "ready") return "denied";
  return account.membershipRole === "owner" || account.membershipRole === "admin" || account.membershipRole === "member"
    ? "allowed"
    : "denied";
}
