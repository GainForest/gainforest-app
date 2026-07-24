const DEFAULT_AUTH_DESTINATION = "/manage";

/** Converts redirect input to a same-app path and rejects protocol-relative input. */
export function normalizeAuthRedirect(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return DEFAULT_AUTH_DESTINATION;

  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    const url = new URL(decoded);
    return `${url.pathname}${url.search}${url.hash}` || DEFAULT_AUTH_DESTINATION;
  } catch {
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : DEFAULT_AUTH_DESTINATION;
  }
}
