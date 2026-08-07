import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NotificationRepositoryError } from "./repository";
import { processNotificationClaim } from "./worker";
import type {
  Claim,
  EmailProvider,
  FrozenEmailRequest,
  InvitationSourceReader,
  NotificationRepository,
  NotificationRow,
  ProviderErrorCode,
  ProviderOutcome,
  RequeueErrorCode,
  UserEmailReader,
} from "./types";

const ID = "10000000-0000-4000-8000-000000000001";
const TOKEN = "20000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T01:00:00.000Z");

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: ID,
    eventType: "signup",
    payload: { name: "Test" },
    sourceId: "source-1",
    recipientDid: null,
    recipientEmail: "person@example.com",
    templateKey: "welcome",
    locale: "en",
    frozenRequest: null,
    status: "processing",
    providerCallPhase: "idle",
    providerCallIsAmbiguousRetry: false,
    providerIdempotencyKey: "source-1",
    providerIdempotencyExpiresAt: null,
    processingRunCount: 1,
    providerAttemptCount: 0,
    processingToken: TOKEN,
    lockedUntil: new Date(NOW.getTime() + 120_000),
    createdAt: NOW,
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    outboxId: ID,
    previousStatus: "queued",
    resumeProviderCallPhase: "idle",
    processingToken: TOKEN,
    lockedUntil: new Date(NOW.getTime() + 120_000),
    ...overrides,
  };
}

class StateRepository implements NotificationRepository {
  readonly transitionTimeoutMs = 10_000;
  current: NotificationRow;
  active = true;
  actions: string[] = [];
  nextTransitionResult: boolean | null = null;
  deferredExpiry: Date | null = null;
  deferredReclaimAt: Date | null = null;
  transitionTimes: Array<{ action: string; at: Date }> = [];

  constructor(initial = row()) { this.current = initial; }
  private owned(id: string, token: string) {
    if (!this.active || id !== this.current.id || token !== this.current.processingToken) {
      throw new Error("fake repository rejected row/token ownership misuse");
    }
  }
  private result(): boolean {
    if (this.nextTransitionResult === null) return true;
    const value = this.nextTransitionResult;
    this.nextTransitionResult = null;
    return value;
  }
  async claimDue(): Promise<Claim[]> { return []; }
  async claimOne(): Promise<Claim | null> { return null; }
  async getClaimed(value: Claim): Promise<NotificationRow> {
    this.owned(value.outboxId, value.processingToken);
    return this.current;
  }
  async resolveRecipient(id: string, token: string, email: string) {
    this.owned(id, token); this.actions.push("resolve");
    if (!this.result()) return false;
    this.current = { ...this.current, recipientEmail: email };
    return true;
  }
  async waitRecipient(id: string, token: string, at: Date, code: "recipient_missing" | "recipient_lookup_failed") {
    this.owned(id, token); this.actions.push(`wait:${code}`); this.transitionTimes.push({ action: `wait:${code}`, at }); this.active = false; return this.result();
  }
  async freezeRequest(id: string, token: string, request: Omit<FrozenEmailRequest, "idempotencyKey">) {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "idle") throw new Error("fake repository requires idle freeze");
    this.actions.push("freeze");
    if (!this.result()) return false;
    this.current = {
      ...this.current,
      frozenRequest: { ...request, idempotencyKey: this.current.providerIdempotencyKey },
    };
    return true;
  }
  async beginProviderCall(id: string, token: string, expiresAt: Date) {
    this.owned(id, token);
    if (!this.current.frozenRequest) throw new Error("fake repository forbids begin before freeze");
    this.actions.push("begin");
    if (!this.result()) return false;
    const original = this.current.providerIdempotencyExpiresAt;
    this.current = {
      ...this.current,
      providerCallPhase: "in_flight",
      providerCallIsAmbiguousRetry: this.current.providerCallPhase === "in_flight" || this.current.providerCallIsAmbiguousRetry,
      providerIdempotencyExpiresAt: original && original < expiresAt ? original : expiresAt,
      providerAttemptCount: this.current.providerAttemptCount + 1,
    };
    return true;
  }
  async recordProviderFailure(id: string, token: string, code: ProviderErrorCode) {
    this.owned(id, token); this.actions.push(`failure:${code}`);
    if (!this.result()) return false;
    if (!this.current.providerCallIsAmbiguousRetry) {
      this.current = { ...this.current, providerCallPhase: "idle", providerIdempotencyExpiresAt: null };
    }
    return true;
  }
  async terminalProviderFailure(id: string, token: string, code: "provider_rejected" | "notification_invalid") {
    this.owned(id, token); this.actions.push(`terminal-provider:${code}`);
    if (!this.result()) return false;
    if (this.current.providerCallPhase !== "in_flight" || this.current.providerCallIsAmbiguousRetry) return false;
    this.current = {
      ...this.current,
      providerCallPhase: "idle",
      providerCallIsAmbiguousRetry: false,
      providerIdempotencyExpiresAt: null,
    };
    this.active = false;
    return true;
  }
  async markSent(id: string, token: string, providerId: string) {
    this.owned(id, token); this.actions.push(`sent:${providerId}`);
    if (!this.result()) return false;
    this.active = false; return true;
  }
  async requeue(id: string, token: string, at: Date, code: RequeueErrorCode) {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "idle") throw new Error("fake repository forbids ambiguous requeue");
    this.actions.push(`requeue:${code}`); this.transitionTimes.push({ action: `requeue:${code}`, at }); this.active = false; return this.result();
  }
  async markDead(id: string, token: string, code: "provider_rejected" | "provider_timeout" | "provider_idempotency_expired" | "active_retention_expired" | "notification_invalid") {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "idle") throw new Error("fake repository forbids ambiguous dead transition");
    this.actions.push(`dead:${code}`); this.active = false; return this.result();
  }
  async expireClaimed(id: string, token: string, code: "provider_idempotency_expired" | "active_retention_expired") {
    this.owned(id, token);
    this.actions.push(`expire:${code}`); this.active = false; return this.result();
  }
  async suppressClaimed(id: string, token: string, code: "invitation_not_pending" | "manually_suppressed") {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "idle") throw new Error("fake repository forbids in-flight suppression");
    this.actions.push(`suppress:${code}`); this.active = false; return this.result();
  }
  async releaseClaim(id: string, token: string) {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "idle") throw new Error("fake repository forbids in-flight release");
    this.actions.push("release"); this.active = false; return this.result();
  }
  async deferAmbiguous(id: string, token: string, reclaimAt: Date) {
    this.owned(id, token);
    if (this.current.providerCallPhase !== "in_flight") throw new Error("fake repository requires in-flight defer");
    this.actions.push("defer");
    this.deferredExpiry = this.current.providerIdempotencyExpiresAt;
    this.deferredReclaimAt = reclaimAt;
    this.active = false; return this.result();
  }
}

function scriptedProvider(outcomes: ProviderOutcome[], requests: FrozenEmailRequest[] = []): EmailProvider {
  return {
    timeoutMs: 10_000,
    idempotencyGuaranteeMs: 86_400_000,
    async send(request) {
      requests.push(structuredClone(request));
      const outcome = outcomes.shift();
      if (!outcome) throw new Error("unexpected provider call");
      return outcome;
    },
  };
}

function setup(repository = new StateRepository(), provider: EmailProvider = scriptedProvider([{ kind: "sent", providerId: "provider-1" }])) {
  let time = NOW.getTime();
  const sleeps: number[] = [];
  const renderer = { render: vi.fn(async () => ({ subject: "Subject", html: "<p>Body</p>", text: "Body" })) };
  const userEmailLookup = vi.fn<UserEmailReader["lookup"]>();
  userEmailLookup.mockResolvedValue({ kind: "missing" });
  const invitationSendability = vi.fn<InvitationSourceReader["getSendability"]>();
  invitationSendability.mockResolvedValue({ kind: "sendable" });
  const dependencies = {
    from: "GainForest <noreply@example.com>",
    repository,
    provider,
    renderer,
    clock: {
      now: () => new Date(time),
      sleep: async (ms: number) => { sleeps.push(ms); time += ms; },
    },
    userEmailReader: { lookup: userEmailLookup },
    invitationSourceReader: { getSendability: invitationSendability },
    invocationDeadline: new Date(NOW.getTime() + 120_000),
    safetyMarginMs: 5_000,
  };
  return {
    dependencies, repository, renderer, sleeps, userEmailLookup, invitationSendability,
    advanceTime: (ms: number) => { time += ms; },
  };
}

describe("notification worker provider state machine", () => {
  it("freezes before sending, retries byte-identical requests, and caps one run at three calls", async () => {
    const requests: FrozenEmailRequest[] = [];
    const provider = scriptedProvider([
      { kind: "transient", errorCode: "provider_5xx" },
      { kind: "transient", errorCode: "provider_5xx" },
      { kind: "transient", errorCode: "provider_5xx" },
    ], requests);
    const { dependencies, repository, sleeps } = setup(new StateRepository(), provider);

    const result = await processNotificationClaim(claim(), dependencies);

    expect(result.kind).toBe("requeued");
    expect(requests).toHaveLength(3);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[2]).toEqual(requests[0]);
    expect(repository.actions[0]).toBe("freeze");
    expect(repository.actions).toEqual([
      "freeze", "begin", "failure:provider_5xx", "begin", "failure:provider_5xx",
      "begin", "failure:provider_5xx", "requeue:provider_5xx",
    ]);
    expect(sleeps).toEqual([500, 1500]);
  });

  it.each(["provider_rejected", "notification_invalid"] as const)(
    "atomically terminalizes a fresh permanent provider response (%s)", async errorCode => {
      const requests: FrozenEmailRequest[] = [];
      const { dependencies, repository } = setup(
        new StateRepository(),
        scriptedProvider([{ kind: "permanent", errorCode }], requests),
      );
      expect(await processNotificationClaim(claim(), dependencies)).toEqual({ kind: "dead", errorCode });
      expect(requests).toHaveLength(1);
      expect(repository.actions).toEqual(["freeze", "begin", `terminal-provider:${errorCode}`]);
      expect(repository.active).toBe(false);
    },
  );

  it("returns stale when atomic permanent terminalization loses ownership", async () => {
    const repository = new StateRepository();
    const value = setup(repository, scriptedProvider([{ kind: "permanent", errorCode: "provider_rejected" }]));
    const terminal = vi.spyOn(repository, "terminalProviderFailure").mockImplementationOnce(async (id, token, code) => {
      repository.actions.push(`terminal-provider:${code}`);
      repository.nextTransitionResult = null;
      return false;
    });

    expect(await processNotificationClaim(claim(), value.dependencies)).toEqual({ kind: "stale_claim" });
    expect(terminal).toHaveBeenCalledOnce();
    expect(repository.actions).toEqual(["freeze", "begin", "terminal-provider:provider_rejected"]);
  });

  it("durably requeues Retry-After that exceeds the quick retry window", async () => {
    const { dependencies, repository, sleeps } = setup(
      new StateRepository(),
      scriptedProvider([{ kind: "transient", errorCode: "provider_rate_limited", retryAfterMs: 10_000 }]),
    );
    expect((await processNotificationClaim(claim(), dependencies)).kind).toBe("requeued");
    expect(repository.actions).toContain("requeue:provider_rate_limited");
    expect(sleeps).toEqual([]);
  });

  it("clamps Retry-After to the exact seven-day active boundary", async () => {
    const createdAt = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
    const repository = new StateRepository(row({ createdAt }));
    const value = setup(repository, scriptedProvider([{
      kind: "transient", errorCode: "provider_rate_limited", retryAfterMs: 30 * 24 * 60 * 60 * 1000,
    }]));

    expect((await processNotificationClaim(claim(), value.dependencies)).kind).toBe("requeued");
    expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000));
  });

  it("defers without sending when beginProviderCall consumes the remaining call budget", async () => {
    const requests: FrozenEmailRequest[] = [];
    const repository = new StateRepository();
    const value = setup(repository, scriptedProvider([{ kind: "sent", providerId: "must-not-send" }], requests));
    const begin = repository.beginProviderCall.bind(repository);
    vi.spyOn(repository, "beginProviderCall").mockImplementationOnce(async (...args) => {
      const started = await begin(...args);
      value.advanceTime(106_000);
      return started;
    });

    expect(await processNotificationClaim(claim(), value.dependencies)).toEqual({ kind: "ambiguous_deferred" });
    expect(requests).toEqual([]);
    expect(repository.actions).toEqual(["freeze", "begin", "defer"]);
  });

  it("defers uncertain transport without ordinary requeue and preserves original resumed expiry", async () => {
    const originalExpiry = new Date(NOW.getTime() + 60_000);
    const initial = row({
      frozenRequest: {
        from: "from@example.com", to: "person@example.com", subject: "Frozen",
        html: "Frozen html", text: "Frozen text", idempotencyKey: "source-1",
      },
      providerCallPhase: "in_flight",
      providerCallIsAmbiguousRetry: true,
      providerIdempotencyExpiresAt: originalExpiry,
    });
    const repository = new StateRepository(initial);
    const { dependencies, renderer } = setup(repository, scriptedProvider([
      { kind: "transient", errorCode: "provider_5xx" },
    ]));

    const result = await processNotificationClaim(claim({
      previousStatus: "processing",
      resumeProviderCallPhase: "in_flight",
    }), dependencies);

    expect(result.kind).toBe("ambiguous_deferred");
    expect(repository.actions).toEqual(["begin", "failure:provider_5xx", "defer"]);
    expect(repository.actions).not.toContain("requeue:provider_5xx");
    expect(repository.deferredExpiry).toEqual(originalExpiry);
    expect(repository.deferredReclaimAt!.getTime()).toBeLessThan(originalExpiry.getTime());
    expect(repository.deferredReclaimAt!.getTime()).toBeLessThanOrEqual(NOW.getTime() + 60_000);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it("keeps a permanent response on an ambiguous retry defer-only", async () => {
    const originalExpiry = new Date(NOW.getTime() + 60_000);
    const repository = new StateRepository(row({
      frozenRequest: {
        from: "from@example.com", to: "person@example.com", subject: "Frozen",
        html: "Frozen html", text: "Frozen text", idempotencyKey: "source-1",
      },
      providerCallPhase: "in_flight",
      providerCallIsAmbiguousRetry: true,
      providerIdempotencyExpiresAt: originalExpiry,
    }));
    const value = setup(repository, scriptedProvider([{ kind: "permanent", errorCode: "provider_rejected" }]));

    expect(await processNotificationClaim(claim({
      previousStatus: "processing", resumeProviderCallPhase: "in_flight",
    }), value.dependencies)).toEqual({ kind: "ambiguous_deferred" });
    expect(repository.actions).toEqual(["begin", "failure:provider_rejected", "defer"]);
    expect(repository.actions).not.toContain("terminal-provider:provider_rejected");
  });

  it("defers an uncertain first call and treats stale transitions as safely lost ownership", async () => {
    const repository = new StateRepository();
    const first = setup(repository, scriptedProvider([{ kind: "uncertain", errorCode: "provider_timeout" }]));
    expect((await processNotificationClaim(claim(), first.dependencies)).kind).toBe("ambiguous_deferred");
    expect(repository.actions).not.toContain("requeue:provider_timeout");

    const staleRepository = new StateRepository();
    staleRepository.nextTransitionResult = false;
    const stale = setup(staleRepository);
    expect((await processNotificationClaim(claim(), stale.dependencies)).kind).toBe("stale_claim");
  });
});

describe("notification worker preflight and safety", () => {
  it("sends a previously persisted BioBlitz recipient after a resolve/crash without another lookup", async () => {
    const requests: FrozenEmailRequest[] = [];
    const repository = new StateRepository(row({
      eventType: "bioblitz_winner",
      recipientDid: "did:plc:winner",
      recipientEmail: "stored-winner@example.com",
    }));
    const value = setup(repository, scriptedProvider([{ kind: "sent", providerId: "provider-1" }], requests));

    expect(await processNotificationClaim(claim({ previousStatus: "processing" }), value.dependencies)).toEqual({ kind: "sent" });
    expect(value.userEmailLookup).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0].to).toBe("stored-winner@example.com");
  });

  it("distinguishes missing, failed, and ready BioBlitz recipient lookup", async () => {
    for (const [lookup, expectedAction] of [
      [{ kind: "missing" as const }, "wait:recipient_missing"],
      [{ kind: "error" as const }, "wait:recipient_lookup_failed"],
    ] as const) {
      const repository = new StateRepository(row({
        eventType: "bioblitz_winner", recipientEmail: null, recipientDid: "did:plc:winner",
      }));
      const { dependencies, userEmailLookup } = setup(repository);
      userEmailLookup.mockResolvedValueOnce(lookup);
      await processNotificationClaim(claim({ previousStatus: "waiting_recipient" }), dependencies);
      expect(repository.actions).toEqual([expectedAction]);
    }

    const repository = new StateRepository(row({
      eventType: "bioblitz_winner", recipientEmail: null, recipientDid: "did:plc:winner",
    }));
    const { dependencies, userEmailLookup } = setup(repository);
    userEmailLookup.mockResolvedValueOnce({ kind: "ready", email: "winner@example.com" });
    expect((await processNotificationClaim(claim({ previousStatus: "waiting_recipient" }), dependencies)).kind).toBe("sent");
    expect(repository.actions.slice(0, 2)).toEqual(["resolve", "freeze"]);
  });

  it("suppresses non-sendable invitations and requeues invitation lookup errors before rendering", async () => {
    const suppressedRepository = new StateRepository(row({ eventType: "invitation", sourceId: "invite-1" }));
    const suppressed = setup(suppressedRepository);
    suppressed.invitationSendability.mockResolvedValueOnce({ kind: "expired" });
    expect((await processNotificationClaim(claim(), suppressed.dependencies)).kind).toBe("suppressed");
    expect(suppressedRepository.actions).toEqual(["suppress:invitation_not_pending"]);
    expect(suppressed.renderer.render).not.toHaveBeenCalled();

    const errorRepository = new StateRepository(row({ eventType: "invitation", sourceId: "invite-1" }));
    const errored = setup(errorRepository);
    errored.invitationSendability.mockResolvedValueOnce({ kind: "error" });
    expect((await processNotificationClaim(claim(), errored.dependencies)).kind).toBe("requeued");
    expect(errorRepository.actions).toEqual(["requeue:recipient_lookup_failed"]);
    expect(errored.renderer.render).not.toHaveBeenCalled();
  });

  it("rejects incomplete, malicious, or oversized rendering before provider start", async () => {
    for (const render of [
      { subject: "", html: "ok", text: "ok" },
      { subject: "ok\r\nBcc: attacker@example.com", html: "ok", text: "ok" },
      { subject: "ok", html: "x".repeat(262_145), text: "ok" },
    ]) {
      const repository = new StateRepository();
      const provider = scriptedProvider([]);
      const value = setup(repository, provider);
      value.renderer.render.mockResolvedValueOnce(render);
      expect((await processNotificationClaim(claim(), value.dependencies)).kind).toBe("dead");
      expect(repository.actions).toEqual(["dead:notification_invalid"]);
      expect(repository.actions).not.toContain("begin");
    }
  });

  it("releases idle work when the deadline or lease cannot fit a call", async () => {
    const shortRepository = new StateRepository();
    const short = setup(shortRepository);
    short.dependencies.invocationDeadline = new Date(NOW.getTime() + 14_999);
    expect((await processNotificationClaim(claim(), short.dependencies)).kind).toBe("released_insufficient_time");
    expect(shortRepository.actions).toEqual(["release"]);
  });

  it("reserves enough deadline for the repository transition after a provider call", async () => {
    const repository = new StateRepository();
    const provider = scriptedProvider([{ kind: "sent", providerId: "must-not-send" }]);
    const value = setup(repository, provider);
    value.dependencies.safetyMarginMs = 0;
    value.dependencies.invocationDeadline = new Date(
      NOW.getTime() + provider.timeoutMs + repository.transitionTimeoutMs * 2,
    );

    await expect(processNotificationClaim(claim(), value.dependencies)).resolves.toEqual({
      kind: "released_insufficient_time",
    });
    expect(repository.actions).toEqual(["release"]);
  });

});

describe("notification worker review regressions", () => {
  it.each(["idle", "in_flight"] as const)("expires active-retention %s claims before dependencies", async phase => {
    const repository = new StateRepository(row({
      createdAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
      providerCallPhase: phase,
      providerCallIsAmbiguousRetry: phase === "in_flight",
      providerIdempotencyExpiresAt: phase === "in_flight" ? new Date(NOW.getTime() + 60_000) : null,
      frozenRequest: phase === "in_flight" ? {
        from: "from@example.com", to: "person@example.com", subject: "Frozen", html: "Frozen", text: "Frozen", idempotencyKey: "source-1",
      } : null,
    }));
    const value = setup(repository, scriptedProvider([]));
    const result = await processNotificationClaim(claim({
      previousStatus: phase === "in_flight" ? "processing" : "queued",
      resumeProviderCallPhase: phase,
    }), value.dependencies);
    expect(result).toEqual({ kind: "dead", errorCode: "active_retention_expired" });
    expect(repository.actions).toEqual(["expire:active_retention_expired"]);
    expect(value.renderer.render).not.toHaveBeenCalled();
  });

  it("expires resumed ambiguity at its stored provider boundary", async () => {
    const repository = new StateRepository(row({
      createdAt: new Date(NOW.getTime() - 1_000),
      frozenRequest: { from: "from@example.com", to: "person@example.com", subject: "Frozen", html: "Frozen", text: "Frozen", idempotencyKey: "source-1" },
      providerCallPhase: "in_flight", providerCallIsAmbiguousRetry: true,
      providerIdempotencyExpiresAt: NOW,
    }));
    const value = setup(repository, scriptedProvider([]));
    expect(await processNotificationClaim(claim({ previousStatus: "processing", resumeProviderCallPhase: "in_flight" }), value.dependencies))
      .toEqual({ kind: "dead", errorCode: "provider_idempotency_expired" });
    expect(repository.actions).toEqual(["expire:provider_idempotency_expired"]);
  });

  it.each(["not_pending", "expired", "error"] as const)("defers resumed invitation source result %s without re-rendering", async kind => {
    const repository = new StateRepository(row({
      eventType: "invitation", sourceId: "invite-1",
      frozenRequest: { from: "from@example.com", to: "person@example.com", subject: "Frozen", html: "Frozen", text: "Frozen", idempotencyKey: "source-1" },
      providerCallPhase: "in_flight", providerCallIsAmbiguousRetry: true,
      providerIdempotencyExpiresAt: new Date(NOW.getTime() + 60_000),
    }));
    const value = setup(repository, scriptedProvider([]));
    value.invitationSendability.mockResolvedValueOnce({ kind });
    expect((await processNotificationClaim(claim({ previousStatus: "processing", resumeProviderCallPhase: "in_flight" }), value.dependencies)).kind)
      .toBe("ambiguous_deferred");
    expect(repository.actions).toEqual(["defer"]);
    expect(value.renderer.render).not.toHaveBeenCalled();
  });

  it("turns deterministic invalid work and renderer rejection into terminal notification_invalid", async () => {
    const values = [
      setup(new StateRepository(), scriptedProvider([])),
      setup(new StateRepository(row({ recipientEmail: null })), scriptedProvider([])),
      setup(new StateRepository(row({ eventType: "invitation", sourceId: null })), scriptedProvider([])),
      setup(new StateRepository(), scriptedProvider([])),
    ];
    values[0].dependencies.from = "";
    values[3].renderer.render.mockRejectedValueOnce(new Error("private render detail"));
    for (const value of values) {
      expect(await processNotificationClaim(claim(), value.dependencies)).toEqual({ kind: "dead", errorCode: "notification_invalid" });
      expect(value.repository.actions).toEqual(["dead:notification_invalid"]);
      expect(value.repository.actions).not.toContain("begin");
    }
  });

  it("handles rejected recipient and source reads without starting the provider", async () => {
    const bio = setup(new StateRepository(row({ eventType: "bioblitz_winner", recipientEmail: null, recipientDid: "did:plc:winner" })));
    bio.userEmailLookup.mockRejectedValueOnce(new Error("private lookup detail"));
    expect(await processNotificationClaim(claim({ previousStatus: "processing" }), bio.dependencies))
      .toEqual({ kind: "waiting_recipient", errorCode: "recipient_lookup_failed" });
    expect(bio.repository.actions).toEqual(["wait:recipient_lookup_failed"]);

    const invitation = setup(new StateRepository(row({ eventType: "invitation", sourceId: "invite-1" })));
    invitation.invitationSendability.mockRejectedValueOnce(new Error("private source detail"));
    expect(await processNotificationClaim(claim(), invitation.dependencies))
      .toEqual({ kind: "requeued", errorCode: "recipient_lookup_failed" });
    expect(invitation.repository.actions).toEqual(["requeue:recipient_lookup_failed"]);
  });

  it.each([[1, 60_000], [2, 300_000], [3, 1_800_000], [4, 7_200_000], [5, 43_200_000], [8, 43_200_000]])(
    "indexes durable backoff by processing run %i", async (processingRunCount, expectedMs) => {
      const repository = new StateRepository(row({ processingRunCount, providerAttemptCount: 99 }));
      const value = setup(repository, scriptedProvider([{ kind: "transient", errorCode: "provider_5xx", retryAfterMs: 10_000 }]));
      await processNotificationClaim(claim(), value.dependencies);
      expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(NOW.getTime() + expectedMs));
    },
  );

  it("gives Retry-After precedence only when longer than run backoff", async () => {
    for (const [retryAfterMs, expectedMs] of [[100_000, 300_000], [400_000, 400_000]] as const) {
      const repository = new StateRepository(row({ processingRunCount: 2 }));
      const value = setup(repository, scriptedProvider([{ kind: "transient", errorCode: "provider_rate_limited", retryAfterMs }]));
      await processNotificationClaim(claim(), value.dependencies);
      expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(NOW.getTime() + expectedMs));
    }
  });

  it.each([
    ["missing", 1, 3_600_000], ["missing", 2, 21_600_000], ["missing", 3, 86_400_000], ["missing", 8, 86_400_000],
    ["error", 1, 60_000], ["error", 2, 300_000], ["error", 3, 1_800_000], ["error", 8, 1_800_000],
  ] as const)("schedules BioBlitz recipient %s at run %i exactly", async (kind, processingRunCount, expectedMs) => {
    const repository = new StateRepository(row({
      eventType: "bioblitz_winner", recipientDid: "did:plc:winner", recipientEmail: null, processingRunCount,
    }));
    const value = setup(repository);
    value.userEmailLookup.mockResolvedValueOnce({ kind });
    await processNotificationClaim(claim({ previousStatus: "waiting_recipient" }), value.dependencies);
    expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(NOW.getTime() + expectedMs));
  });

  it.each([[1, 60_000], [2, 300_000], [3, 1_800_000], [8, 1_800_000]] as const)(
    "schedules invitation source errors at run %i exactly", async (processingRunCount, expectedMs) => {
      const repository = new StateRepository(row({ eventType: "invitation", sourceId: "invite-1", processingRunCount }));
      const value = setup(repository);
      value.invitationSendability.mockResolvedValueOnce({ kind: "error" });
      await processNotificationClaim(claim(), value.dependencies);
      expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(NOW.getTime() + expectedMs));
    },
  );

  it.each(["missing", "error", "invitation"] as const)("caps %s schedules at the exact active boundary", async kind => {
    const createdAt = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000 + 30_000);
    const initial = kind === "invitation"
      ? row({ eventType: "invitation", sourceId: "invite-1", createdAt })
      : row({ eventType: "bioblitz_winner", recipientDid: "did:plc:winner", recipientEmail: null, createdAt });
    const repository = new StateRepository(initial);
    const value = setup(repository);
    if (kind === "invitation") value.invitationSendability.mockResolvedValueOnce({ kind: "error" });
    else value.userEmailLookup.mockResolvedValueOnce({ kind });
    await processNotificationClaim(claim({ previousStatus: kind === "invitation" ? "queued" : "waiting_recipient" }), value.dependencies);
    expect(repository.transitionTimes.at(-1)?.at).toEqual(new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000));
  });

  it("returns only typed stale reads while propagating malformed repository responses", async () => {
    const stale = new StateRepository();
    vi.spyOn(stale, "getClaimed").mockRejectedValueOnce(new NotificationRepositoryError("stale_claim"));
    expect(await processNotificationClaim(claim(), setup(stale).dependencies)).toEqual({ kind: "stale_claim" });

    const malformed = new StateRepository();
    vi.spyOn(malformed, "getClaimed").mockRejectedValueOnce(new NotificationRepositoryError("invalid_response"));
    await expect(processNotificationClaim(claim(), setup(malformed).dependencies)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rechecks the deadline after rendering and prevents freeze/provider start", async () => {
    const value = setup(new StateRepository(), scriptedProvider([]));
    value.dependencies.invocationDeadline = new Date(NOW.getTime() + 20_000);
    value.renderer.render.mockImplementationOnce(async () => {
      value.advanceTime(6_000);
      return { subject: "Subject", html: "Body", text: "Body" };
    });
    expect((await processNotificationClaim(claim(), value.dependencies)).kind).toBe("released_insufficient_time");
    expect(value.repository.actions).toEqual(["release"]);
  });
});
