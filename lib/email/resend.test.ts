import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.hoisted(() => vi.fn());

vi.mock("node:https", () => ({ request: requestMock }));

import { sendResendEmail } from "./resend";

afterEach(() => {
  vi.unstubAllEnvs();
  requestMock.mockReset();
});

describe("sendResendEmail", () => {
  it("sends the frozen provider request with explicit credentials and timeout", async () => {
    let writtenBody = "";
    const setTimeout = vi.fn();
    requestMock.mockImplementation((options, onResponse) => {
      const request = new EventEmitter() as EventEmitter & {
        setTimeout: typeof setTimeout;
        write(body: string): boolean;
        end(): void;
        destroy(error: Error): void;
      };
      request.setTimeout = setTimeout;
      request.write = (body: string) => {
        writtenBody = body;
        return true;
      };
      request.destroy = (error: Error) => request.emit("error", error);
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        response.statusCode = 200;
        response.headers = {};
        onResponse(response);
        response.emit("data", Buffer.from('{"id":"resend-email-1"}'));
        response.emit("end");
      };
      return request;
    });

    await expect(sendResendEmail({
      apiKey: "re_explicit",
      from: "GainForest <frozen@gainforest.id>",
      to: "person@example.com",
      subject: "Subject",
      html: "<p>Body</p>",
      text: "Body",
      idempotencyKey: "event-1",
      timeoutMs: 7_500,
    })).resolves.toEqual({ id: "resend-email-1" });

    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        authorization: "Bearer re_explicit",
        "idempotency-key": "event-1",
      }),
    }), expect.any(Function));
    expect(JSON.parse(writtenBody)).toEqual({
      from: "GainForest <frozen@gainforest.id>",
      to: ["person@example.com"],
      subject: "Subject",
      html: "<p>Body</p>",
      text: "Body",
    });
    expect(setTimeout).toHaveBeenCalledWith(7_500, expect.any(Function));
  });

  it("returns Resend error codes and Retry-After timing to the provider adapter", async () => {
    requestMock.mockImplementation((_options, onResponse) => {
      const request = new EventEmitter() as EventEmitter & {
        setTimeout(ms: number, callback: () => void): void;
        write(body: string): boolean;
        end(): void;
        destroy(error: Error): void;
      };
      request.setTimeout = () => undefined;
      request.write = () => true;
      request.destroy = (error: Error) => request.emit("error", error);
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        response.statusCode = 429;
        response.headers = { "retry-after": "30" };
        onResponse(response);
        response.emit("data", Buffer.from('{"name":"rate_limit_exceeded","message":"Too many requests."}'));
        response.emit("end");
      };
      return request;
    });

    await expect(sendResendEmail({
      apiKey: "re_explicit",
      to: "person@example.com",
      subject: "Subject",
      html: "<p>Body</p>",
    })).rejects.toMatchObject({
      name: "EmailSendError",
      status: 429,
      code: "rate_limit_exceeded",
      retryAfterMs: 30_000,
    });
  });
});
