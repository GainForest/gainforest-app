import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDrainRuntime } from "./drain-runtime";

afterEach(() => vi.unstubAllGlobals());

describe("createDrainRuntime", () => {
  it("is inert when email is disabled and performs no repository/provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const runtime = createDrainRuntime({ EMAIL_DISABLED: "true" });
    await expect(runtime.drain(new Date(Date.now() + 55_000))).resolves.toEqual({ kind: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
