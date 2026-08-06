import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(), fetchData: vi.fn(), award: vi.fn(), notify: vi.fn(), prepare: vi.fn(), process: vi.fn(),
  frozenWinners: vi.fn(), list: vi.fn(), mark: vi.fn(), afterCallbacks: [] as Array<() => Promise<unknown>>,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=cookie" }) }));
vi.mock("next/server", () => ({ after: (callback: () => Promise<unknown>) => mocks.afterCallbacks.push(callback) }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (value: string | null) => value }));
vi.mock("@/app/internal/badges/_lib/access", () => ({ getGainForestModeratorAccess: mocks.getAccess }));
vi.mock("@/app/_lib/bioblitz", () => ({
  endedRounds: () => [{ id: 4, label: "Week 4" }],
  frozenWinnersFor: () => mocks.frozenWinners(),
  fetchRoundCollectors: vi.fn(),
  fetchRoundTopLiked: vi.fn(),
}));
vi.mock("@/app/internal/badges/_lib/badge-records", () => ({ fetchInternalBadgeData: mocks.fetchData }));
vi.mock("@/app/internal/badges/_lib/recognition", () => ({
  RecognitionMutationError: class RecognitionMutationError extends Error { constructor(message: string, readonly status: number) { super(message); } },
  awardRecognition: mocks.award,
}));
vi.mock("@/app/_lib/bioblitz-notifications", () => ({
  notifyBioblitzWinner: mocks.notify,
  prepareBioblitzWinnerNotification: mocks.prepare,
  processBioblitzWinnerNotification: mocks.process,
  listBioblitzNotificationSummaries: mocks.list,
  markBioblitzNotificationHandled: mocks.mark,
  bioblitzNotificationSourceId: (roundId: number, prize: string) => `bioblitz:${roundId}:${prize}`,
}));

const definitions = [
  { uri: "at://defs/most", title: "bioblitz-most-images-round-4" },
  { uri: "at://defs/best", title: "bioblitz-best-picture-round-4" },
];
const awards = [
  { badge: { uri: "at://defs/most" }, subjectDid: "did:plc:most", createdAt: "2026-08-06T01:00:00.000Z" },
  { badge: { uri: "at://defs/best" }, subjectDid: "did:plc:best", createdAt: "2026-08-06T01:00:00.000Z" },
];

beforeEach(() => {
  mocks.getAccess.mockReset();
  mocks.getAccess.mockResolvedValue({ isLoggedIn: true, configured: true, isModerator: true, repoDid: "did:plc:gf", session: { isLoggedIn: true, did: "did:plc:mod" } });
  mocks.frozenWinners.mockReset();
  mocks.frozenWinners.mockReturnValue({
    mostObservations: { did: "did:plc:most", count: 10 },
    bestPicture: { did: "did:plc:best" },
  });
  mocks.award.mockReset();
  mocks.award
    .mockResolvedValueOnce({ subjectDid: "did:plc:most", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" })
    .mockResolvedValueOnce({ subjectDid: "did:plc:best", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" });
  mocks.notify.mockReset();
  mocks.notify.mockResolvedValue({ status: "sent", canMarkHandled: false });
  mocks.prepare.mockReset();
  mocks.prepare
    .mockResolvedValueOnce({ notification: { status: "delayed", canMarkHandled: true }, processOutboxId: "10000000-0000-4000-8000-000000000001" })
    .mockResolvedValueOnce({ notification: { status: "delayed", canMarkHandled: true }, processOutboxId: "10000000-0000-4000-8000-000000000002" });
  mocks.process.mockReset();
  mocks.process.mockResolvedValue({ status: "sent", canMarkHandled: false });
  mocks.afterCallbacks.length = 0;
  mocks.fetchData.mockReset();
  mocks.fetchData.mockResolvedValue({ definitions, awards, pendingAwards: [], repoDid: "did:plc:gf" });
  mocks.list.mockReset();
  mocks.list.mockResolvedValue(new Map([
    ["bioblitz:4:most-observations", { status: "missing_email", canMarkHandled: true }],
    ["bioblitz:4:best-picture", { status: "sent", canMarkHandled: false }],
  ]));
  mocks.mark.mockReset();
  mocks.mark.mockResolvedValue({ status: "handled_manually", canMarkHandled: false });
});

describe("BioBlitz award notifications", () => {
  it("makes both badges durable before scheduling notification processing after the response", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ roundId: 4 }) }));
    expect(response.status).toBe(200);
    expect(mocks.award).toHaveBeenCalledTimes(2);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(Math.max(...mocks.award.mock.invocationCallOrder)).toBeLessThan(Math.min(...mocks.prepare.mock.invocationCallOrder));
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(mocks.process).not.toHaveBeenCalled();

    await mocks.afterCallbacks[0]();
    expect(mocks.process).toHaveBeenCalledTimes(2);
  });

  it("continues the second badge and notification when the first badge mutation fails", async () => {
    mocks.award
      .mockReset()
      .mockRejectedValueOnce(new Error("first badge failed"))
      .mockResolvedValueOnce({ subjectDid: "did:plc:best", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" });
    mocks.fetchData.mockResolvedValueOnce({
      definitions,
      awards: [awards[1]],
      pendingAwards: [],
      repoDid: "did:plc:gf",
    });
    mocks.list.mockResolvedValueOnce(new Map([
      ["bioblitz:4:best-picture", { status: "sent", canMarkHandled: false }],
    ]));

    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ roundId: 4 }) }));
    expect(response.status).toBe(200);
    expect(mocks.award).toHaveBeenCalledTimes(2);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      prize: "best-picture",
      winnerDid: "did:plc:best",
    }));
    await expect(response.json()).resolves.toMatchObject({
      mostImages: false,
      bestPicture: true,
      bestPictureNotification: { status: "delayed" },
    });
  });

  it("prepares independent prize notifications when one person wins both", async () => {
    mocks.frozenWinners.mockReturnValue({
      mostObservations: { did: "did:plc:same", count: 10 },
      bestPicture: { did: "did:plc:same" },
    });
    mocks.award
      .mockReset()
      .mockResolvedValueOnce({ subjectDid: "did:plc:same", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" })
      .mockResolvedValueOnce({ subjectDid: "did:plc:same", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" });

    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ roundId: 4 }) }));
    expect(response.status).toBe(200);
    const preparedInputs = mocks.prepare.mock.calls.map(([input]) => input);
    expect(preparedInputs).toEqual([
      expect.objectContaining({ prize: "most-observations", winnerDid: "did:plc:same" }),
      expect.objectContaining({ prize: "best-picture", winnerDid: "did:plc:same" }),
    ]);
  });

  it("returns the exact setup failure while preserving both durable awards", async () => {
    mocks.prepare
      .mockReset()
      .mockResolvedValueOnce({ notification: { status: "notification_setup_failed", canMarkHandled: true }, processOutboxId: null })
      .mockResolvedValueOnce({ notification: { status: "delayed", canMarkHandled: true }, processOutboxId: "10000000-0000-4000-8000-000000000002" });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ roundId: 4 }) }));
    expect(response.status).toBe(200);
    expect(mocks.award).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      mostImagesNotification: { status: "notification_setup_failed", canMarkHandled: true },
    });
  });

  it("marks only the canonical recorded winner notification handled", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ action: "mark-notification-handled", roundId: 4, prize: "best-picture" }) }));
    expect(response.status).toBe(200);
    expect(mocks.mark).toHaveBeenCalledWith({ roundId: 4, prize: "best-picture", winnerDid: "did:plc:best", moderatorDid: "did:plc:mod" });
  });
});
