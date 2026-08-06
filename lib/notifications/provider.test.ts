import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CaptureEmailProvider, CaptureSinkConflictError, InMemoryCaptureSink } from "./provider";
import type { FrozenEmailRequest } from "./types";

const request: FrozenEmailRequest = {
  from: "from@example.com",
  to: "person@example.com",
  subject: "Subject",
  html: "<p>Body</p>",
  text: "Body",
  idempotencyKey: "event-1",
};

describe("capture provider idempotency", () => {
  it("derives its idempotency guarantee from the sink and rejects invalid capabilities", () => {
    const sink = new InMemoryCaptureSink();
    expect(sink.idempotencyGuaranteeMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(new CaptureEmailProvider(sink).idempotencyGuaranteeMs).toBe(sink.idempotencyGuaranteeMs);

    for (const idempotencyGuaranteeMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new CaptureEmailProvider({ idempotencyGuaranteeMs, captureOnce: () => "captured" }))
        .toThrow("Capture sink idempotency guarantee must be a positive finite number of milliseconds.");
    }
  });

  it("captures a key once and treats the same request as a deterministic duplicate", async () => {
    const sink = new InMemoryCaptureSink();
    expect(await sink.captureOnce(request.idempotencyKey, request)).toBe("captured");
    expect(await sink.captureOnce(request.idempotencyKey, structuredClone(request))).toBe("duplicate");
    expect(sink.captured()).toEqual([request]);
  });

  it("rejects key reuse with different bytes without a second capture", async () => {
    const sink = new InMemoryCaptureSink();
    await sink.captureOnce(request.idempotencyKey, request);
    await expect(sink.captureOnce(request.idempotencyKey, { ...request, subject: "Changed" }))
      .rejects.toBeInstanceOf(CaptureSinkConflictError);
    expect(sink.captured()).toEqual([request]);
  });

  it("a fresh process-local sink has neither the prior key nor its captured side effect", async () => {
    const first = new InMemoryCaptureSink();
    expect(await first.captureOnce(request.idempotencyKey, request)).toBe("captured");

    const fresh = new InMemoryCaptureSink();
    expect(fresh.captured()).toEqual([]);
    expect(await fresh.captureOnce(request.idempotencyKey, request)).toBe("captured");
    expect(fresh.captured()).toEqual([request]);
  });

  it("uses the explicit idempotency key contract and reports local sink rejection definitively", async () => {
    const sink = new InMemoryCaptureSink();
    const provider = new CaptureEmailProvider(sink);
    expect(await provider.send(request, { timeoutMs: provider.timeoutMs })).toEqual({ kind: "sent", providerId: "capture" });
    expect(await provider.send(request, { timeoutMs: provider.timeoutMs })).toEqual({ kind: "sent", providerId: "capture" });
    expect(await provider.send({ ...request, subject: "Changed" }, { timeoutMs: provider.timeoutMs }))
      .toEqual({ kind: "permanent", errorCode: "notification_invalid" });
    expect(sink.captured()).toEqual([request]);
  });

  it("propagates unexpected sink failures so the worker can treat the outcome as uncertain", async () => {
    const provider = new CaptureEmailProvider({
      idempotencyGuaranteeMs: 60_000,
      captureOnce: async () => { throw new TypeError("capture storage unavailable"); },
    });

    await expect(provider.send(request, { timeoutMs: provider.timeoutMs }))
      .rejects.toThrow("capture storage unavailable");
  });
});
