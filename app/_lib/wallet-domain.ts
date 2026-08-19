/**
 * The minimum number of characters before the admin wallet lookup runs.
 * Lives here (no `server-only`) so the client panel and the server loader can
 * both read it without leaking a server-only import into the browser bundle.
 */
export const MIN_WALLET_SEARCH_LENGTH = 2;

/**
 * The PDS hosting this app's accounts (personal + org). Mirrors the default
 * used across the app, defaulting to the production certified.one server.
 */
export function defaultWalletPdsDomain(): string {
  return (
    process.env.NEXT_PUBLIC_DEFAULT_PDS_DOMAIN ||
    process.env.DEFAULT_PDS_DOMAIN ||
    "certified.one"
  )
    .trim()
    .replace(/^@+|\.+$/g, "");
}
