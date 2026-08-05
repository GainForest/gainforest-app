import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  getAccess: vi.fn(), fetchData: vi.fn(), award: vi.fn(), notify: vi.fn(), list: vi.fn(), mark: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "session=cookie" }) }));
vi.mock("@/app/_lib/auth", () => ({ getAuthForwardCookie: (value: string | null) => value }));
vi.mock("@/app/internal/badges/_lib/access", () => ({ getGainForestModeratorAccess: mocks.getAccess }));
vi.mock("@/app/_lib/bioblitz", () => ({
  endedRounds: () => [{ id: 4, label: "Week 4" }],
  frozenWinnersFor: () => ({
    mostObservations: { did: "did:plc:most", count: 10 },
    bestPicture: { did: "did:plc:best" },
  }),
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
  mocks.award.mockReset();
  mocks.award
    .mockResolvedValueOnce({ subjectDid: "did:plc:most", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" })
    .mockResolvedValueOnce({ subjectDid: "did:plc:best", note: null, url: null, createdAt: "2026-08-06T01:00:00.000Z" });
  mocks.notify.mockReset();
  mocks.notify.mockResolvedValue({ status: "sent", canMarkHandled: false });
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
  it("continues the second durable award when first notification setup fails", async () => {
    mocks.notify.mockRejectedValueOnce(new Error("notification setup failed")).mockResolvedValueOnce({ status: "sent", canMarkHandled: false });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ roundId: 4 }) }));
    expect(response.status).toBe(200);
    expect(mocks.award).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it("marks only the canonical recorded winner notification handled", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ action: "mark-notification-handled", roundId: 4, prize: "best-picture" }) }));
    expect(response.status).toBe(200);
    expect(mocks.mark).toHaveBeenCalledWith({ roundId: 4, prize: "best-picture", winnerDid: "did:plc:best", moderatorDid: "did:plc:mod" });
  });
});
