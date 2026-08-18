import { expect, test } from "@playwright/test";
import { createAudioRecording } from "../support/audio-flow";

const authStatePath = "e2e/.auth/user.json";

test.use({ storageState: authStatePath });

test("uploads an audio recording", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const audio = await createAudioRecording(page, testInfo);
  expect(String(audio.value.name)).toMatch(/^E2E Audio Recording/);
});
