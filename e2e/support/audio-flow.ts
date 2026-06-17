import { expect, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { trackCreatedPdsRecord, waitForAudioRecordingByName, type PdsRepoRecord } from "./pds";
import { groupManageBasePath, readCgsOrgMetadata } from "./cgs-org";

function makeTinyWavBuffer(): Buffer {
  const sampleRate = 8_000;
  const durationSeconds = 0.25;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function manageBasePath(): string {
  const org = readCgsOrgMetadata();
  return org ? groupManageBasePath(org) : "/manage";
}

export async function createAudioRecording(page: Page, testInfo: TestInfo): Promise<PdsRepoRecord> {
  const name = `E2E Audio Recording ${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}`;

  await page.goto(`${manageBasePath()}/audio?section=recordings&mode=new`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /upload audio recording/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "audio-create-open");

  await page.locator('input[type="file"]').first().setInputFiles({
    name: "e2e-field-sound.wav",
    mimeType: "audio/wav",
    buffer: makeTinyWavBuffer(),
  });
  await expect(page.getByText(/8000 Hz/i)).toBeVisible({ timeout: 15_000 });
  const form = page.locator("section").filter({ hasText: /upload audio recording/i }).first();
  await form.getByLabel(/^name/i).fill(name);
  await form.getByLabel(/^description$/i).fill("Short field sound recording created by the disposable browser test.");
  await form.getByLabel(/^recorded by$/i).fill("Disposable E2E Recorder");
  await form.getByLabel(/^tags$/i).fill("e2e, field-sound");
  await screenshotStep(page, testInfo, "audio-create-ready");

  await page.getByRole("button", { name: /^save$/i }).click();
  const record = await waitForAudioRecordingByName(name);
  trackCreatedPdsRecord(record);
  await screenshotStep(page, testInfo, "audio-create-saved");

  return record;
}
