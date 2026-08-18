import { describe, expect, it } from "vitest";
import { cachedAsync } from "./async-cache";

describe("cachedAsync", () => {
  it("lets one caller abort without cancelling the shared cached load", async () => {
    const key = `abort-shared-load-${Date.now()}-${Math.random()}`;
    let loadCalls = 0;
    let resolveLoader: ((value: string) => void) | undefined;

    const loader = () => {
      loadCalls += 1;
      return new Promise<string>((resolve) => {
        resolveLoader = resolve;
      });
    };

    const controller = new AbortController();
    const abortedCaller = cachedAsync(key, 60_000, loader, controller.signal);
    const activeCaller = cachedAsync(key, 60_000, loader);

    controller.abort();
    resolveLoader?.("loaded");

    await expect(abortedCaller).rejects.toMatchObject({ name: "AbortError" });
    await expect(activeCaller).resolves.toBe("loaded");
    expect(loadCalls).toBe(1);
  });
});
