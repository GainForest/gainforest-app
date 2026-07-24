import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_UPLOAD_MAX_ATTEMPTS,
  isNetworkFetchError,
  isRetryableStorageError,
  storageStatusFromError,
  withUploadRetries,
} from "./upload-retry";

describe("AudioMoth upload retries", () => {
  it("recognises offline fetch failures across browsers", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFetchError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkFetchError(new TypeError("NetworkError when attempting to fetch a resource."))).toBe(true);
    expect(isNetworkFetchError(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkFetchError(new Error("Failed to fetch"))).toBe(false);
  });

  it("extracts the HTTP status from storage PUT failures", () => {
    expect(storageStatusFromError(new Error("storage_503"))).toBe(503);
    expect(storageStatusFromError(new Error("storage_network"))).toBeNull();
    expect(storageStatusFromError(new Error("other"))).toBeNull();
  });

  it("recognises temporary connection and storage failures", () => {
    expect(isRetryableStorageError(new Error("storage_network"))).toBe(true);
    expect(isRetryableStorageError(new Error("storage_429"))).toBe(true);
    expect(isRetryableStorageError(new Error("storage_503"))).toBe(true);
    expect(isRetryableStorageError(new Error("storage_403"))).toBe(false);
    expect(isRetryableStorageError(new Error("aborted"))).toBe(false);
  });

  it("retries temporary failures and reports each retry", async () => {
    const operation = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error("storage_network"))
      .mockRejectedValueOnce(new Error("storage_503"))
      .mockResolvedValue("uploaded");
    const onRetry = vi.fn();
    const wait = vi.fn(async (_delayMs: number) => undefined);

    await expect(
      withUploadRetries(operation, {
        shouldRetry: isRetryableStorageError,
        onRetry,
        wait,
      }),
    ).resolves.toBe("uploaded");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(operation.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([1_000, 2_500]);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextAttempt: 3, maxAttempts: AUDIO_UPLOAD_MAX_ATTEMPTS }),
    );
  });

  it("does not retry permanent failures", async () => {
    const operation = vi.fn(async () => {
      throw new Error("storage_403");
    });
    const wait = vi.fn(async (_delayMs: number) => undefined);

    await expect(
      withUploadRetries(operation, {
        shouldRetry: isRetryableStorageError,
        wait,
      }),
    ).rejects.toThrow("storage_403");
    expect(operation).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("stops after the configured number of attempts", async () => {
    const operation = vi.fn(async () => {
      throw new Error("storage_network");
    });

    await expect(
      withUploadRetries(operation, {
        shouldRetry: isRetryableStorageError,
        delaysMs: [0, 0],
        wait: async () => undefined,
      }),
    ).rejects.toThrow("storage_network");
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
