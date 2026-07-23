export type InvitationAcceptResponse = { ok: boolean; error?: string };

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Called only from an explicit user action. Rendering an invitation never invokes it. */
export async function requestInvitationAcceptance(
  invitationId: string,
  fetcher: FetchLike = fetch,
): Promise<InvitationAcceptResponse> {
  const response = await fetcher(`/api/cgs/invitations/${encodeURIComponent(invitationId)}/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return { ok: response.ok && !data?.error, error: data?.error };
}
