export type ParsedAtUri = { did: string; collection: string; rkey: string };

export function parseAtUri(uri: string): ParsedAtUri | null {
  const match = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { did: match[1], collection: match[2], rkey: match[3] };
}
