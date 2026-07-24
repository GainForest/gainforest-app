import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ObservationMediaViewer.tsx", import.meta.url), "utf8");

describe("observation media viewer semantics", () => {
  it("scopes arrow-key navigation to the viewer", () => {
    expect(source).toContain("onKeyDown={handleGalleryKeyDown}");
    expect(source).not.toContain('document.addEventListener("keydown"');
  });

  it("uses the shared dialog, focuses close, and restores the zoom trigger", () => {
    expect(source).toContain("DialogPlaceholder");
    expect(source).toContain("onOpenAutoFocus");
    expect(source).toContain("closeButtonRef.current?.focus()");
    expect(source).toContain("zoomTriggerRef.current?.focus()");
  });
});
