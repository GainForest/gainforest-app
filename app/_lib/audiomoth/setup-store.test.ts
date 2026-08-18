import { describe, expect, it } from "vitest";
import { mergeSetupNotes, SETUP_NOTES_HEADER } from "./setup-store";

const BLOCK_V1 = [SETUP_NOTES_HEADER, "Firmware: AudioMoth-Firmware-Basic 1.12.0", "Last setup: 2026-01-01 10:00 UTC"].join("\n");
const BLOCK_V2 = [SETUP_NOTES_HEADER, "Firmware: AudioMoth-Firmware-Basic 1.12.1", "Last setup: 2026-07-07 12:00 UTC"].join("\n");

describe("mergeSetupNotes", () => {
  it("uses the block alone when there are no notes", () => {
    expect(mergeSetupNotes(undefined, BLOCK_V2)).toBe(BLOCK_V2);
    expect(mergeSetupNotes("", BLOCK_V2)).toBe(BLOCK_V2);
  });

  it("appends the block after handwritten notes", () => {
    expect(mergeSetupNotes("Deployed at the river site.", BLOCK_V2)).toBe(`Deployed at the river site.\n\n${BLOCK_V2}`);
  });

  it("replaces a previous setup block, keeping handwritten notes", () => {
    const existing = `Deployed at the river site.\n\n${BLOCK_V1}`;
    expect(mergeSetupNotes(existing, BLOCK_V2)).toBe(`Deployed at the river site.\n\n${BLOCK_V2}`);
  });

  it("replaces a notes value that is only an old setup block", () => {
    expect(mergeSetupNotes(BLOCK_V1, BLOCK_V2)).toBe(BLOCK_V2);
  });
});
