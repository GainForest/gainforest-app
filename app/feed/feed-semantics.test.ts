import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const feedClient = readFileSync(new URL("./FeedClient.tsx", import.meta.url), "utf8");
const feedDialog = readFileSync(new URL("./FeedImageLightbox.tsx", import.meta.url), "utf8");

describe("feed interaction semantics", () => {
  it("keeps expansion controls out of link-like row wrappers", () => {
    expect(feedClient).not.toContain('role="button"');
    expect(feedClient).not.toContain("RowTextWrapper");
  });

  it("uses the shared focus-managed dialog", () => {
    expect(feedDialog).toContain("DialogPlaceholder");
    expect(feedDialog).toContain("onOpenAutoFocus");
    expect(feedDialog).toContain("closeButtonRef.current?.focus()");
    expect(feedDialog).toContain("onCloseAutoFocus");
  });

  it("does not expose shortened DIDs as identity labels", () => {
    expect(feedClient).not.toContain("shortDid");
  });
});
