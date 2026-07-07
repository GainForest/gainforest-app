import { randomBytes } from "node:crypto";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { trackCreatedPdsRecord } from "./pds";

/**
 * AudioMoth SD-card upload flow helpers.
 *
 * Builds AudioMoth-style WAV files (RIFF `LIST INFO` header with the
 * firmware's `ICMT` comment, including the acoustic-chime deployment ID) so
 * the Upload tab's client-side recognition can be exercised end to end, and
 * creates the matching `dwc.event` deployment through the app's own
 * session-gated proxy — the same route the Deployments tab uses.
 */

const DEVICE_ID = "24F3190361DA539A";

export function randomDeploymentIdHex(): string {
  return randomBytes(8).toString("hex");
}

export function makeAudioMothWavBuffer(options: {
  deploymentId: string;
  recordedAtComment: string; // e.g. "19:00:00 15/04/2024"
  seconds?: number;
}): Buffer {
  const sampleRate = 8_000;
  const samples = Math.floor(sampleRate * (options.seconds ?? 0.5));
  const dataSize = samples * 2;

  const comment =
    `Recorded at ${options.recordedAtComment} (UTC) by AudioMoth ${DEVICE_ID} at medium gain ` +
    `while battery state was 4.2V and temperature was 24.0C ` +
    `during deployment ${options.deploymentId.toUpperCase()}.`;
  const artist = `AudioMoth ${DEVICE_ID}`;

  const pad = (s: string) => (s.length % 2 ? `${s}\0` : s);
  const icmt = pad(comment);
  const iart = pad(artist);
  const listSize = 4 + 8 + icmt.length + 8 + iart.length;
  const total = 12 + 8 + 16 + 8 + listSize + 8 + dataSize;

  const buffer = Buffer.alloc(total);
  let o = 0;
  const w = (text: string) => {
    buffer.write(text, o, "ascii");
    o += text.length;
  };
  const u32 = (v: number) => {
    buffer.writeUInt32LE(v, o);
    o += 4;
  };
  const u16 = (v: number) => {
    buffer.writeUInt16LE(v, o);
    o += 2;
  };

  w("RIFF");
  u32(total - 8);
  w("WAVE");
  w("fmt ");
  u32(16);
  u16(1); // PCM
  u16(1); // mono
  u32(sampleRate);
  u32(sampleRate * 2);
  u16(2);
  u16(16);
  w("LIST");
  u32(listSize);
  w("INFO");
  w("ICMT");
  u32(icmt.length);
  w(icmt);
  w("IART");
  u32(iart.length);
  w(iart);
  w("data");
  u32(dataSize);
  // PCM payload: quiet noise so previews/spectrograms have real content.
  for (let i = 0; i < samples; i += 1) {
    buffer.writeInt16LE(Math.floor((Math.random() - 0.5) * 2000), o + i * 2);
  }
  return buffer;
}

export type CreatedDeployment = {
  uri: string;
  did: string;
  rkey: string;
  deploymentId: string;
  siteName: string;
};

/** Create a chime deployment event through the app's own mutation proxy. */
export async function createDeploymentEventViaApi(page: Page, testInfo: TestInfo): Promise<CreatedDeployment> {
  const deploymentId = randomDeploymentIdHex();
  const siteName = `E2E Upload Site ${Date.now()}-${testInfo.workerIndex}`;
  const now = new Date();

  const record = {
    $type: "app.gainforest.dwc.event",
    eventID: deploymentId,
    eventDate: now.toISOString(),
    locality: siteName,
    decimalLatitude: "-1.234567",
    decimalLongitude: "-77.891234",
    geodeticDatum: "EPSG:4326",
    samplingProtocol: "AudioMoth passive acoustic monitoring",
    equipmentUsed: "AudioMoth",
    eventRemarks: `Chime deployment ID ${deploymentId}. Created by the disposable browser test.`,
    createdAt: now.toISOString(),
  };

  const response = await page.request.post("/api/manage/proxy", {
    data: { operation: "createRecord", collection: "app.gainforest.dwc.event", record },
  });
  expect(response.ok(), `deployment event creation failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { uri?: string; cid?: string };
  expect(typeof body.uri).toBe("string");

  const uri = body.uri!;
  const [did, , rkey] = uri.slice("at://".length).split("/");
  trackCreatedPdsRecord({ uri, cid: body.cid ?? "", value: record });

  return { uri, did: did!, rkey: rkey!, deploymentId, siteName };
}

/**
 * Scan generated SD-card files on the Upload tab and assert the deployment
 * is recognised from the WAV headers. Returns the generated file names.
 */
export async function scanSdCardFiles(
  page: Page,
  testInfo: TestInfo,
  deployment: CreatedDeployment,
): Promise<string[]> {
  const files = [
    { name: "20240415_190000.WAV", comment: "19:00:00 15/04/2024" },
    { name: "20240415_190500.WAV", comment: "19:05:00 15/04/2024" },
  ];

  await page.goto("/audiomoth?tab=upload", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /choose sd card or folder/i })).toBeVisible({ timeout: 60_000 });
  await screenshotStep(page, testInfo, "audiomoth-upload-pick");

  await page.locator('input[accept*=".wav"]').setInputFiles(
    files.map((file) => ({
      name: file.name,
      mimeType: "audio/wav",
      buffer: makeAudioMothWavBuffer({ deploymentId: deployment.deploymentId, recordedAtComment: file.comment }),
    })),
  );

  // The scan must recognise the chime deployment ID from the WAV headers.
  await expect(page.getByText(`Matched deployment: ${deployment.siteName}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(deployment.deploymentId)).toBeVisible();
  await screenshotStep(page, testInfo, "audiomoth-upload-matched");

  return files.map((file) => file.name);
}
