import { describe, expect, it } from "vitest";
import { getTimelineDeleteControlState } from "./timelineDeleteControls";

describe("timeline delete controls", () => {
  it("shows the delete button only when the current owner can delete", () => {
    expect(
      getTimelineDeleteControlState({
        canManageEvidence: true,
        canDeleteEvidence: true,
        rkey: "entry-1",
      }),
    ).toEqual({ showButton: true, showDeniedMessage: false, disabledReason: null });

    expect(
      getTimelineDeleteControlState({
        canManageEvidence: false,
        canDeleteEvidence: true,
        rkey: "entry-1",
      }).showButton,
    ).toBe(false);

    expect(
      getTimelineDeleteControlState({
        canManageEvidence: true,
        canDeleteEvidence: false,
        rkey: "entry-1",
        deleteDisabledReason: "You cannot remove evidence from this timeline.",
      }),
    ).toEqual({
      showButton: false,
      showDeniedMessage: true,
      disabledReason: "You cannot remove evidence from this timeline.",
    });
  });

  it("hides delete controls when an entry cannot be addressed", () => {
    expect(
      getTimelineDeleteControlState({
        canManageEvidence: true,
        canDeleteEvidence: true,
        rkey: null,
      }),
    ).toEqual({ showButton: false, showDeniedMessage: false, disabledReason: null });
  });
});
