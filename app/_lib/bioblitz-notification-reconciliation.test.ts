import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  fetchData: vi.fn(), list: vi.fn(), enqueue: vi.fn(), rounds: [] as Array<{ id: number; label: string }>, enabled: true,
}));
vi.mock("./bioblitz", () => ({ endedRounds: () => mocks.rounds }));
vi.mock("@/app/internal/badges/_lib/badge-records", () => ({ fetchInternalBadgeData: mocks.fetchData }));
vi.mock("./bioblitz-notifications", () => ({ listBioblitzNotificationSummaries: mocks.list }));
vi.mock("@/lib/notifications/bioblitz-runtime", () => ({
  createBioblitzProducerRuntime: () => ({
    config: {
      deliveryMode: "capture",
      producers: { signup: false, membershipJoined: false, invitation: false, bioblitzWinner: mocks.enabled },
    },
    enqueue: mocks.enqueue,
  }),
}));

import { canonicalBioblitzAwardInputs, reconcileRecentBioblitzNotifications } from "./bioblitz-notification-reconciliation";

const round = { id: 4, label: "Week 4" } as never;
const definition = { uri: "at://defs/most", title: "bioblitz-most-images-round-4" };
function data(dids: string[]) {
  return {
    definitions: [definition],
    awards: dids.map((did, index) => ({ badge: { uri: definition.uri }, subjectDid: did, createdAt: `2026-08-0${index + 5}T01:00:00.000Z` })),
  } as never;
}

beforeEach(() => {
  mocks.enabled = true;
  mocks.rounds = [round];
  mocks.fetchData.mockReset();
  mocks.list.mockReset();
  mocks.enqueue.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("canonicalBioblitzAwardInputs", () => {
  it("derives recent notifications from committed awards without winner calculation", () => {
    expect(canonicalBioblitzAwardInputs(data(["did:plc:winner"]), [round], new Date("2026-08-06T02:00:00.000Z")))
      .toEqual([{ roundId: 4, roundLabel: "Week 4", prize: "most-observations", winnerDid: "did:plc:winner", createdAt: "2026-08-05T01:00:00.000Z" }]);
  });

  it("fails closed on conflicting winners for one round prize", () => {
    expect(canonicalBioblitzAwardInputs(data(["did:plc:first", "did:plc:second"]), [round], new Date("2026-08-07T02:00:00.000Z"))).toEqual([]);
  });

  it("excludes awards older than the 90-day reconciliation window", () => {
    const old = {
      definitions: [definition],
      awards: [{ badge: { uri: definition.uri }, subjectDid: "did:plc:old", createdAt: "2026-05-01T00:00:00.000Z" }],
    } as never;
    expect(canonicalBioblitzAwardInputs(old, [round], new Date("2026-08-06T00:00:00.000Z"))).toEqual([]);
  });
});

describe("reconcileRecentBioblitzNotifications", () => {
  it("does not query award data when the BioBlitz producer is disabled", async () => {
    mocks.enabled = false;
    await expect(reconcileRecentBioblitzNotifications(new Date(Date.now() + 1_000)))
      .resolves.toEqual({ candidates: 0, completed: true });
    expect(mocks.fetchData).not.toHaveBeenCalled();
  });

  it("does not start upstream work after its deadline has passed", async () => {
    await expect(reconcileRecentBioblitzNotifications(new Date(Date.now() - 1)))
      .resolves.toEqual({ candidates: 0, completed: false });
    expect(mocks.fetchData).not.toHaveBeenCalled();
  });

  it("returns bounded completion details for missing deterministic events", async () => {
    mocks.fetchData.mockResolvedValue(data(["did:plc:winner"]));
    mocks.list.mockResolvedValue(new Map([["bioblitz:4:most-observations", { status: "not_prepared", canMarkHandled: true }]]));
    mocks.enqueue.mockResolvedValue({ kind: "enqueued" });

    await expect(reconcileRecentBioblitzNotifications(new Date(Date.now() + 1_000)))
      .resolves.toEqual({ candidates: 1, completed: true });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("processes at most twenty missing candidates per recovery run", async () => {
    mocks.rounds = Array.from({ length: 21 }, (_, index) => ({ id: index + 1, label: `Week ${index + 1}` }));
    const definitions = mocks.rounds.map(item => ({
      uri: `at://defs/${item.id}`,
      title: `bioblitz-most-images-round-${item.id}`,
    }));
    mocks.fetchData.mockResolvedValue({
      definitions,
      awards: definitions.map((item, index) => ({
        badge: { uri: item.uri },
        subjectDid: `did:plc:winner${index + 1}`,
        createdAt: "2026-08-06T01:00:00.000Z",
      })),
    });
    mocks.list.mockResolvedValue(new Map(mocks.rounds.map(item => [
      `bioblitz:${item.id}:most-observations`,
      { status: "not_prepared", canMarkHandled: true },
    ])));
    mocks.enqueue.mockResolvedValue({ kind: "enqueued" });

    await expect(reconcileRecentBioblitzNotifications(new Date(Date.now() + 10_000)))
      .resolves.toEqual({ candidates: 20, completed: false });
    expect(mocks.enqueue).toHaveBeenCalledTimes(20);
  });

  it("awaits a started enqueue instead of letting it cross into drain processing", async () => {
    vi.useFakeTimers();
    mocks.fetchData.mockResolvedValue(data(["did:plc:winner"]));
    mocks.list.mockResolvedValue(new Map([["bioblitz:4:most-observations", { status: "not_prepared", canMarkHandled: true }]]));
    let releaseEnqueue!: () => void;
    mocks.enqueue.mockImplementation(() => new Promise(resolve => {
      releaseEnqueue = () => resolve({ kind: "enqueued" });
    }));
    let result: Awaited<ReturnType<typeof reconcileRecentBioblitzNotifications>> | undefined;
    const reconciliation = reconcileRecentBioblitzNotifications(new Date(Date.now() + 100))
      .then(value => { result = value; return value; });

    try {
      await vi.advanceTimersByTimeAsync(101);
      expect(result).toBeUndefined();
    } finally {
      releaseEnqueue();
      await reconciliation;
    }
    expect(result).toEqual({ candidates: 1, completed: true });
  });

  it("stops a stalled upstream lookup at the supplied deadline", async () => {
    vi.useFakeTimers();
    mocks.fetchData.mockImplementation(() => new Promise(() => {}));
    const deadline = new Date(Date.now() + 100);
    const resultOrTimeout = Promise.race([
      reconcileRecentBioblitzNotifications(deadline),
      new Promise<{ kind: "test_timeout" }>(resolve => setTimeout(() => resolve({ kind: "test_timeout" }), 110)),
    ]);

    await vi.advanceTimersByTimeAsync(110);
    await expect(resultOrTimeout).resolves.toEqual({ candidates: 0, completed: false });
  });
});
