import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NotificationRepositoryError, SupabaseNotificationRepository } from "./repository";

const fetchMock = vi.fn<typeof fetch>();

const rawRow = {
  id: "10000000-0000-4000-8000-000000000001",
  event_type: "signup",
  payload: { name: "Test" },
  source_id: "source-1",
  recipient_did: null,
  recipient_email: "person@example.com",
  template_key: "welcome",
  locale: "en",
  frozen_from: null,
  frozen_to: null,
  frozen_subject: null,
  frozen_html: null,
  frozen_text: null,
  status: "processing",
  provider_call_phase: "idle",
  provider_call_is_ambiguous_retry: false,
  provider_idempotency_key: "signup:source-1",
  provider_idempotency_expires_at: null,
  processing_run_count: 1,
  provider_attempt_count: 0,
  processing_token: "20000000-0000-4000-8000-000000000001",
  locked_until: "2026-08-06T01:02:00.000Z",
  created_at: "2026-08-06T01:00:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SupabaseNotificationRepository", () => {
  it("uses the exact enqueue wire contract and decodes duplicate ownership", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{
      outbox_id: rawRow.id,
      status: "queued",
      duplicate: true,
    }]));
    const repository = new SupabaseNotificationRepository();
    await expect(repository.enqueue({
      eventKey: "signup:source-1",
      eventType: "signup",
      payload: { name: "Test" },
      sourceId: "source-1",
      recipientDid: "did:plc:user",
      recipientEmail: "person@example.com",
      templateKey: "welcome-signup",
      locale: "en",
      providerIdempotencyKey: "signup:source-1",
      nextAttemptAt: new Date("2026-08-06T01:00:00.000Z"),
    })).resolves.toEqual({ outboxId: rawRow.id, status: "queued", duplicate: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/rest/v1/rpc/notification_outbox_enqueue");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      p_event_key: "signup:source-1",
      p_event_type: "signup",
      p_payload: { name: "Test" },
      p_source_id: "source-1",
      p_recipient_did: "did:plc:user",
      p_recipient_email: "person@example.com",
      p_template_key: "welcome-signup",
      p_locale: "en",
      p_provider_idempotency_key: "signup:source-1",
      p_next_attempt_at: "2026-08-06T01:00:00.000Z",
    });
  });

  it("uses the exact cleanup wire contract and decodes aggregate counts", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ active_expired: 2, redacted: 3, deleted: 4 }]));
    const repository = new SupabaseNotificationRepository();
    await expect(repository.cleanup(250)).resolves.toEqual({ activeExpired: 2, redacted: 3, deleted: 4 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/rest/v1/rpc/notification_outbox_cleanup");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ p_batch_size: 250 });
  });

  it("decodes aggregate queue health without row data", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      waiting_recipient: 2,
      queued: 3,
      processing: 1,
      dead: 4,
      oldest_due_age_seconds: 125,
    }));
    const repository = new SupabaseNotificationRepository();
    await expect(repository.health()).resolves.toEqual({
      waitingRecipient: 2, queued: 3, processing: 1, dead: 4, oldestDueAgeSeconds: 125,
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/rest/v1/rpc/notification_outbox_health");
    expect(fetchMock.mock.calls[0][1]?.body).toBe("{}");
  });

  it("calls claim RPC with the committed signature and service-role boundary", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{
      outbox_id: rawRow.id,
      previous_status: "queued",
      resume_provider_call_phase: "idle",
      processing_token: rawRow.processing_token,
      locked_until: rawRow.locked_until,
    }]));

    const repository = new SupabaseNotificationRepository();
    const claims = await repository.claimDue(4, 120);

    expect(claims).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://project.supabase.co/rest/v1/rpc/notification_outbox_claim_due");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ p_batch_size: 4, p_lease_seconds: 120 });
    expect(headers.get("apikey")).toBe("service-role-secret");
    expect(headers.get("authorization")).toBe("Bearer service-role-secret");
  });

  it("gets only the token-owned processing row and decodes it", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([rawRow]));
    const repository = new SupabaseNotificationRepository();
    const row = await repository.getClaimed({
      outboxId: rawRow.id,
      previousStatus: "queued",
      resumeProviderCallPhase: "idle",
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    });

    expect(row.recipientEmail).toBe("person@example.com");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/rest/v1/notification_outbox?");
    expect(url).toContain(`id=eq.${rawRow.id}`);
    expect(url).toContain(`processing_token=eq.${rawRow.processing_token}`);
    expect(url).toContain("status=eq.processing");
  });

  it("preserves permissive string timestamp parsing and ignores unknown row fields", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{
      ...rawRow,
      locked_until: "2026-08-06 01:02:00+00",
      created_at: "2026-08-06",
      future_database_column: "ignored",
    }]));
    const repository = new SupabaseNotificationRepository();

    const row = await repository.getClaimed({
      outboxId: rawRow.id,
      previousStatus: "queued",
      resumeProviderCallPhase: "idle",
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    });

    expect(row.lockedUntil).toEqual(new Date("2026-08-06T01:02:00.000Z"));
    expect(row.createdAt).toEqual(new Date("2026-08-06T00:00:00.000Z"));
    expect(row).not.toHaveProperty("future_database_column");
  });

  it.each([
    ["the nil UUID", "00000000-0000-0000-0000-000000000000"],
    ["the max UUID", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
  ])("rejects %s even though Zod's generic UUID format accepts it", async (_label, outboxId) => {
    fetchMock.mockResolvedValueOnce(Response.json([{
      outbox_id: outboxId,
      previous_status: "queued",
      resume_provider_call_phase: "idle",
      processing_token: rawRow.processing_token,
      locked_until: rawRow.locked_until,
    }]));

    await expect(new SupabaseNotificationRepository().claimDue(1, 60)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("decodes a complete frozen request and in-flight provider expiry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{
      ...rawRow,
      frozen_from: "GainForest <noreply@gainforest.id>",
      frozen_to: "person@example.com",
      frozen_subject: "Welcome",
      frozen_html: "<p>Welcome</p>",
      frozen_text: "Welcome",
      provider_call_phase: "in_flight",
      provider_idempotency_expires_at: "2026-08-07 01:00:00+00",
    }]));

    const row = await new SupabaseNotificationRepository().getClaimed({
      outboxId: rawRow.id,
      previousStatus: "queued",
      resumeProviderCallPhase: "in_flight",
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    });

    expect(row.frozenRequest).toEqual({
      from: "GainForest <noreply@gainforest.id>",
      to: "person@example.com",
      subject: "Welcome",
      html: "<p>Welcome</p>",
      text: "Welcome",
      idempotencyKey: rawRow.provider_idempotency_key,
    });
    expect(row.providerIdempotencyExpiresAt).toEqual(new Date("2026-08-07T01:00:00.000Z"));
  });

  it("rejects non-string timestamps and partially frozen requests", async () => {
    const repository = new SupabaseNotificationRepository();
    const claim = {
      outboxId: rawRow.id,
      previousStatus: "queued" as const,
      resumeProviderCallPhase: "idle" as const,
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    };

    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, locked_until: 0 }]));
    await expect(repository.getClaimed(claim)).rejects.toMatchObject({ code: "invalid_response" });

    fetchMock.mockResolvedValueOnce(Response.json([{
      ...rawRow,
      frozen_from: "from@example.com",
    }]));
    await expect(repository.getClaimed(claim)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("keeps the payload JSON nesting limit at 20 levels", async () => {
    const nestedPayload = (depth: number): unknown => {
      let value: unknown = "leaf";
      for (let index = 0; index < depth; index += 1) value = [value];
      return value;
    };
    const repository = new SupabaseNotificationRepository();
    const claim = {
      outboxId: rawRow.id,
      previousStatus: "queued" as const,
      resumeProviderCallPhase: "idle" as const,
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    };

    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, payload: nestedPayload(20) }]));
    await expect(repository.getClaimed(claim)).resolves.toMatchObject({ payload: nestedPayload(20) });

    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, payload: nestedPayload(21) }]));
    await expect(repository.getClaimed(claim)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("uses exact claimOne wire name and body", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([]));
    const repository = new SupabaseNotificationRepository();
    expect(await repository.claimOne(rawRow.id, rawRow.processing_token, 45)).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe("https://project.supabase.co/rest/v1/rpc/notification_outbox_claim_one");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      p_outbox_id: rawRow.id,
      p_token: rawRow.processing_token,
      p_lease_seconds: 45,
    });
  });

  it.each([
    ["resolve_recipient", (repository: SupabaseNotificationRepository) => repository.resolveRecipient(rawRow.id, rawRow.processing_token, "ready@example.com"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_recipient_email: "ready@example.com" }],
    ["wait_recipient", (repository: SupabaseNotificationRepository) => repository.waitRecipient(rawRow.id, rawRow.processing_token, new Date("2026-08-06T02:00:00.000Z"), "recipient_missing"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_next_attempt_at: "2026-08-06T02:00:00.000Z", p_error_code: "recipient_missing" }],
    ["freeze_request", (repository: SupabaseNotificationRepository) => repository.freezeRequest(rawRow.id, rawRow.processing_token, { from: "from@example.com", to: "person@example.com", subject: "Subject", html: "<p>Body</p>", text: "Body" }), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_from: "from@example.com", p_to: "person@example.com", p_subject: "Subject", p_html: "<p>Body</p>", p_text: "Body" }],
    ["begin_provider_call", (repository: SupabaseNotificationRepository) => repository.beginProviderCall(rawRow.id, rawRow.processing_token, new Date("2026-08-07T01:00:00.000Z")), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_idempotency_expires_at: "2026-08-07T01:00:00.000Z" }],
    ["defer_ambiguous", (repository: SupabaseNotificationRepository) => repository.deferAmbiguous(rawRow.id, rawRow.processing_token, new Date("2026-08-06T01:01:00.000Z")), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_reclaim_at: "2026-08-06T01:01:00.000Z" }],
    ["record_provider_failure", (repository: SupabaseNotificationRepository) => repository.recordProviderFailure(rawRow.id, rawRow.processing_token, "provider_5xx"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_error_code: "provider_5xx" }],
    ["terminal_provider_failure", (repository: SupabaseNotificationRepository) => repository.terminalProviderFailure(rawRow.id, rawRow.processing_token, "provider_rejected"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_error_code: "provider_rejected" }],
    ["mark_sent", (repository: SupabaseNotificationRepository) => repository.markSent(rawRow.id, rawRow.processing_token, "provider-1"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_provider_id: "provider-1" }],
    ["requeue", (repository: SupabaseNotificationRepository) => repository.requeue(rawRow.id, rawRow.processing_token, new Date("2026-08-06T02:00:00.000Z"), "provider_rate_limited"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_next_attempt_at: "2026-08-06T02:00:00.000Z", p_error_code: "provider_rate_limited" }],
    ["mark_dead", (repository: SupabaseNotificationRepository) => repository.markDead(rawRow.id, rawRow.processing_token, "notification_invalid"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_error_code: "notification_invalid" }],
    ["expire_claimed", (repository: SupabaseNotificationRepository) => repository.expireClaimed(rawRow.id, rawRow.processing_token, "active_retention_expired"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_error_code: "active_retention_expired" }],
    ["suppress_claimed", (repository: SupabaseNotificationRepository) => repository.suppressClaimed(rawRow.id, rawRow.processing_token, "invitation_not_pending"), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token, p_error_code: "invitation_not_pending" }],
    ["release_claim", (repository: SupabaseNotificationRepository) => repository.releaseClaim(rawRow.id, rawRow.processing_token), { p_outbox_id: rawRow.id, p_token: rawRow.processing_token }],
  ] as const)("uses exact %s transition RPC wire contract", async (suffix, invoke, expectedBody) => {
    fetchMock.mockResolvedValueOnce(Response.json(true));
    expect(await invoke(new SupabaseNotificationRepository())).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://project.supabase.co/rest/v1/rpc/notification_outbox_${suffix}`);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(expectedBody);
  });

  it("distinguishes an empty token-owned row read as stale_claim but rejects malformed non-empty rows", async () => {
    const log = vi.fn();
    const repository = new SupabaseNotificationRepository({ log });
    const ownedClaim = {
      outboxId: rawRow.id,
      previousStatus: "queued" as const,
      resumeProviderCallPhase: "idle" as const,
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    };
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(repository.getClaimed(ownedClaim)).rejects.toMatchObject({ code: "stale_claim" });
    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, recipient_email: 42 }]));
    await expect(repository.getClaimed(ownedClaim)).rejects.toMatchObject({ code: "invalid_response" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({ code: "invalid_response", operation: "get_claimed" });
  });

  it("rejects malformed claim, row, and transition responses with actionable internal errors", async () => {
    const repository = new SupabaseNotificationRepository();
    fetchMock.mockResolvedValueOnce(Response.json([{ outbox_id: "not-a-uuid" }]));
    await expect(repository.claimDue(1, 60)).rejects.toThrow(
      "Notification repository returned an invalid claim response",
    );

    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, recipient_email: 42 }]));
    await expect(repository.getClaimed({
      outboxId: rawRow.id,
      previousStatus: "queued",
      resumeProviderCallPhase: "idle",
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    })).rejects.toThrow("Notification repository returned an invalid claimed row");

    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(repository.releaseClaim(rawRow.id, rawRow.processing_token)).rejects.toThrow(
      "Notification repository returned an invalid transition response",
    );

    fetchMock.mockResolvedValueOnce(Response.json([{ outbox_id: rawRow.id, status: "queued", duplicate: "yes" }]));
    await expect(repository.enqueue({
      eventKey: "signup:source-1", eventType: "signup", payload: null, sourceId: "source-1",
      recipientDid: null, recipientEmail: "person@example.com", templateKey: "welcome-signup", locale: null,
      providerIdempotencyKey: "signup:source-1", nextAttemptAt: new Date(),
    })).rejects.toThrow("Notification repository returned an invalid enqueue response");

    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(repository.cleanup(100)).rejects.toThrow("Notification repository returned an invalid cleanup response");
  });

  it("redacts idempotency conflict details from enqueue failures", async () => {
    const secret = "person@example.com payload-secret service-role-secret";
    fetchMock.mockResolvedValueOnce(Response.json({
      message: `notification_outbox_idempotency_conflict: ${secret}`,
    }, { status: 409 }));
    const log = vi.fn();
    const repository = new SupabaseNotificationRepository({ log });

    const error = await repository.enqueue({
      eventKey: "signup:source-1", eventType: "signup", payload: null, sourceId: "source-1",
      recipientDid: null, recipientEmail: "person@example.com", templateKey: "welcome-signup", locale: null,
      providerIdempotencyKey: "signup:source-1", nextAttemptAt: new Date("2026-08-06T01:00:00.000Z"),
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(NotificationRepositoryError);
    expect((error as NotificationRepositoryError).code).toBe("idempotency_conflict");
    expect((error as Error).message).toBe(
      "Notification repository operation failed (idempotency_conflict). Check Supabase availability and service-role configuration.",
    );
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).stack ?? "").not.toContain(secret);
    expect(log).toHaveBeenCalledWith({ code: "idempotency_conflict", operation: "enqueue" });
  });

  it.each([
    { provider_call_phase: "idle", provider_call_is_ambiguous_retry: true },
    { provider_call_phase: "in_flight", provider_idempotency_expires_at: null },
    {
      provider_call_phase: "idle",
      provider_call_is_ambiguous_retry: false,
      provider_idempotency_expires_at: "2026-08-07T01:00:00.000Z",
    },
  ])("rejects an impossible provider phase returned by the database", async malformed => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...rawRow, ...malformed }]));
    const repository = new SupabaseNotificationRepository();
    await expect(repository.getClaimed({
      outboxId: rawRow.id,
      previousStatus: "processing",
      resumeProviderCallPhase: malformed.provider_call_phase as "idle" | "in_flight",
      processingToken: rawRow.processing_token,
      lockedUntil: new Date(rawRow.locked_until),
    })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("redacts database response details, addresses, payloads, and credentials", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({
      message: "person@example.com payload secret service-role-secret",
      details: rawRow,
    }, { status: 503 }));
    const log = vi.fn();
    const repository = new SupabaseNotificationRepository({ log });

    const error = await repository.claimDue(1, 60).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NotificationRepositoryError);
    expect((error as Error).message).toBe(
      "Notification repository operation failed (repository_unavailable). Check Supabase availability and service-role configuration.",
    );
    expect(JSON.stringify(error)).not.toContain("person@example.com");
    expect(JSON.stringify(error)).not.toContain("service-role-secret");
    expect(log).toHaveBeenCalledWith({ code: "repository_unavailable", operation: "claim_due" });
  });
});
