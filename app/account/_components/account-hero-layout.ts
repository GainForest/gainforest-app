import { accountPath } from "../_lib/account-route";

export type AccountHeroPresentation = "full" | "compact";

export function accountHeroPresentation(
  pathname: string,
  accountIdentifier: string,
): AccountHeroPresentation {
  return pathname === accountPath(accountIdentifier) ? "full" : "compact";
}
