import { describe, expect, it } from "vitest";
import { getSafeLinkHref } from "./ExternalLinkPreviewRenderer";

describe("external link preview safety", () => {
  it("allows web links and local optimistic blob previews", () => {
    expect(getSafeLinkHref("https://example.org/file.zip")).toBe("https://example.org/file.zip");
    expect(getSafeLinkHref("blob:https://example.org/local-file")).toBe("blob:https://example.org/local-file");
  });

  it("rejects data and script-like links", () => {
    expect(getSafeLinkHref("data:text/plain,hello")).toBeNull();
    expect(getSafeLinkHref("javascript:alert(1)")).toBeNull();
    expect(getSafeLinkHref("not a link")).toBeNull();
  });
});
