import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const token = process.env.R2_LIVE_TOKEN;
describe.skipIf(!token)("R2 live round-trip", () => {
  it("PUT/LIST/GET/presign/DELETE/multipart against the real bucket", async () => {
    process.env.DATA_JOBS_S3_ENDPOINT = "https://36f89a327b912dc993190e4f8c0faacd.r2.cloudflarestorage.com";
    process.env.DATA_JOBS_S3_BUCKET = "gainforest-data-jobs";
    process.env.DATA_JOBS_S3_ACCESS_KEY_ID = "ca7f038c6cfae0dc964ab0e5eea009de";
    process.env.DATA_JOBS_S3_SECRET_ACCESS_KEY = createHash("sha256").update(token!).digest("hex");
    const s3 = await import("./s3-storage");
    const config = s3.getS3Config()!;

    await s3.putJson(config, "healthcheck/roundtrip.json", { ok: true });
    expect(await s3.listKeys(config, "healthcheck/")).toContain("healthcheck/roundtrip.json");
    expect(await s3.getJson(config, "healthcheck/roundtrip.json")).toEqual({ ok: true });
    const presigned = await fetch(s3.presignDownload(config, "healthcheck/roundtrip.json", 60));
    expect(presigned.status).toBe(200);
    await s3.deleteObject(config, "healthcheck/roundtrip.json");
    expect(await s3.getJson(config, "healthcheck/roundtrip.json")).toBeNull();

    const uploadId = await s3.createMultipartUpload(config, "healthcheck/mpu-test.bin");
    expect(uploadId.length).toBeGreaterThan(10);
    const partUrl = s3.presignUploadPart(config, "healthcheck/mpu-test.bin", uploadId, 1);
    const partPut = await fetch(partUrl, { method: "PUT", body: "hello parts" });
    expect(partPut.status).toBe(200);
    expect(partPut.headers.get("etag")).toBeTruthy();
    await s3.completeMultipartUpload(config, "healthcheck/mpu-test.bin", uploadId, [
      { partNumber: 1, etag: partPut.headers.get("etag")! },
    ]);
    expect(await s3.headObject(config, "healthcheck/mpu-test.bin")).toEqual({ sizeBytes: 11 });
    await s3.deleteObject(config, "healthcheck/mpu-test.bin");
  }, 60_000);
});
