import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { requestInvitationAcceptance } from "./invitation-acceptance";

describe("invitation acceptance intent", () => {
  it("keeps the mounted client idle with no effect-driven request", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/invite/[invitationId]/_components/InvitationAcceptClient.tsx"),
      "utf8",
    );

    expect(source).toContain('useState<AcceptStatus>("idle")');
    expect(source).not.toContain("useEffect");
    expect(source).toContain("onClick={() => void accept()}");
    expect(source).toContain("roleLabel={roleLabel}");
  });

  it("makes exactly one request when the explicit acceptance function is called", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));

    expect(fetcher).not.toHaveBeenCalled();

    await expect(requestInvitationAcceptance("invite 1", fetcher)).resolves.toEqual({
      ok: true,
      error: undefined,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/cgs/invitations/invite%201/accept",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a failed result without exposing upstream copy as the client fallback", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "upstream detail" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(requestInvitationAcceptance("invite", fetcher)).resolves.toEqual({
      ok: false,
      error: "upstream detail",
    });
  });
});
