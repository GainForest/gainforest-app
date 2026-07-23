import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tabWrapIndex, topModalToken } from "./use-modal-focus";

const read = (path: string) => readFileSync(path, "utf8");

const dialogSources = [
  "app/_components/AccountDrawer.tsx",
  "app/_components/ProjectGalleryViewer.tsx",
  "app/_components/RecordDrawer.tsx",
];

describe("modal focus containment", () => {
  it("wraps Tab and Shift+Tab only at the dialog boundaries", () => {
    expect(tabWrapIndex(2, 3, false)).toBe(0);
    expect(tabWrapIndex(-1, 3, false)).toBe(0);
    expect(tabWrapIndex(0, 3, true)).toBe(2);
    expect(tabWrapIndex(1, 3, false)).toBeNull();
    expect(tabWrapIndex(1, 3, true)).toBeNull();
    expect(tabWrapIndex(0, 0, false)).toBeNull();
  });

  it("gives Escape and keyboard containment to the topmost nested dialog", () => {
    const parent = Symbol("parent");
    const child = Symbol("child");
    expect(topModalToken([parent])).toBe(parent);
    expect(topModalToken([parent, child])).toBe(child);

    const hook = read("hooks/use-modal-focus.ts");
    expect(hook).toContain("topModalToken(modalStack) !== token");
    expect(hook).toContain('event.key === "Escape"');
    expect(hook).toContain("event.stopImmediatePropagation()");
  });

  it("moves initial focus, hides background branches, and restores the trigger", () => {
    const hook = read("hooks/use-modal-focus.ts");
    expect(hook).toContain("initialFocusRef?.current");
    expect(hook).toContain("sibling.inert = true");
    expect(hook).toContain('sibling.setAttribute("aria-hidden", "true")');
    expect(hook).toContain("previouslyFocused?.isConnected");
    expect(hook).toContain("previouslyFocused.focus()");
  });

  it("names and contains every repaired drawer and dialog", () => {
    for (const path of dialogSources) {
      const source = read(path);
      const dialogs = source.match(/<div\b[^>]*role="dialog"[^>]*>/gs) ?? [];
      expect(dialogs.length, path).toBeGreaterThan(0);
      expect(source, path).toContain("useModalFocus({");
      for (const dialog of dialogs) {
        expect(dialog, `${path}: ${dialog}`).toMatch(/aria-label(?:ledby)?=/);
        expect(dialog, `${path}: ${dialog}`).toContain("tabIndex={-1}");
        expect(dialog, `${path}: ${dialog}`).toContain("ref={dialogRef}");
      }
    }
  });

  it("focuses localized close controls in parent and nested dialogs", () => {
    const account = read("app/_components/AccountDrawer.tsx");
    const record = read("app/_components/RecordDrawer.tsx");
    const gallery = read("app/_components/ProjectGalleryViewer.tsx");

    for (const source of [account, record, gallery]) {
      expect(source).toContain("initialFocusRef: closeButtonRef");
      expect(source).toContain("ref={closeButtonRef}");
    }
    expect(record).toContain('aria-label={t("observation.closeMapLocationChooser")}');
  });

  it("uses Radix containment for AudioMoth dialogs with portaled selects", () => {
    const createDeployment = read("app/audiomoth/_components/DeploymentsTab.tsx");
    const editDeployment = read("app/audiomoth/_components/deployment-shared.tsx");
    const dialogPrimitive = read("components/ui/modal/dialog.tsx");
    const selectPrimitive = read("components/ui/select.tsx");

    for (const source of [createDeployment, editDeployment]) {
      expect(source).toContain("<Dialog");
      expect(source).toContain("<DialogPlaceholder");
      expect(source).toContain("<DialogTitle");
      expect(source).toContain("<SelectContent>");
      expect(source).toContain("onOpenAutoFocus={(event) => {");
      expect(source).toContain("closeButtonRef.current?.focus()");
      expect(source).not.toContain("useModalFocus");
    }
    expect(createDeployment).toContain("if (!open && !busy) onClose()");
    expect(editDeployment).toContain("if (!open && !saving) onClose()");
    expect(dialogPrimitive).toContain("<DialogOverlay className={overlayClassName} />");
    expect(selectPrimitive).toContain("<SelectPrimitive.Portal>");
  });
});
