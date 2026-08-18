import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { presignUrl, presignDownload, presignUploadPart } = await import("./s3-storage");

// Credentials/date from AWS's published SigV4 examples
// (https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html).
const AWS_DOC_CONFIG = {
  endpoint: "https://s3.amazonaws.com",
  bucket: "examplebucket",
  region: "us-east-1",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const AWS_DOC_DATE = new Date("2013-05-24T00:00:00Z");

/**
 * Independent, step-by-step reference implementation of the SigV4 presign
 * algorithm as written in the AWS docs (path-style, UNSIGNED-PAYLOAD), used
 * to cross-check the production signer. The same code reproduces the official
 * doc vector when fed the doc's virtual-hosted host + uri (asserted below).
 */
function referenceSignature(method: string, host: string, uri: string, queryString: string): string {
  const sha = (d: string) => createHash("sha256").update(d).digest("hex");
  const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
  const canonicalRequest = [method, uri, queryString, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    "20130524T000000Z",
    "20130524/us-east-1/s3/aws4_request",
    sha(canonicalRequest),
  ].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${AWS_DOC_CONFIG.secretAccessKey}`, "20130524"), "us-east-1"), "s3"), "aws4_request");
  return hmac(key, stringToSign).toString("hex");
}

const DOC_QUERY_STRING =
  "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host";

describe("presignUrl", () => {
  it("reference implementation reproduces the official AWS doc vector", () => {
    // Sanity-check the reference itself against the published signature
    // (virtual-hosted style, exactly as printed in the AWS docs).
    expect(referenceSignature("GET", "examplebucket.s3.amazonaws.com", "/test.txt", DOC_QUERY_STRING)).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("matches the reference signature for path-style URLs", () => {
    const url = presignUrl(AWS_DOC_CONFIG, "GET", "test.txt", {}, 86400, AWS_DOC_DATE);
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://s3.amazonaws.com/examplebucket/test.txt");
    expect(parsed.searchParams.get("X-Amz-Date")).toBe("20130524T000000Z");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBe(
      referenceSignature("GET", "s3.amazonaws.com", "/examplebucket/test.txt", DOC_QUERY_STRING),
    );
  });

  it("sorts query parameters and encodes keys per RFC 3986", () => {
    const url = presignUrl(AWS_DOC_CONFIG, "PUT", "jobs/a b/archive (1).zip", { uploadId: "x/y+z=" }, 60, AWS_DOC_DATE);
    const { pathname, searchParams } = new URL(url);
    expect(pathname).toBe("/examplebucket/jobs/a%20b/archive%20%281%29.zip");
    expect(searchParams.get("uploadId")).toBe("x/y+z=");
    const keys = [...new URL(url).searchParams.keys()];
    const withoutSignature = keys.filter((k) => k !== "X-Amz-Signature");
    expect(withoutSignature).toEqual([...withoutSignature].sort());
    expect(searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("multipart + download helpers", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("presigns part uploads with partNumber and uploadId", () => {
    const url = presignUploadPart(AWS_DOC_CONFIG, "jobs/j1/archive.zip", "upl-123", 7);
    const params = new URL(url).searchParams;
    expect(params.get("partNumber")).toBe("7");
    expect(params.get("uploadId")).toBe("upl-123");
    expect(params.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("attaches a sanitised download filename", () => {
    const url = presignDownload(AWS_DOC_CONFIG, "jobs/j1/archive.zip", 60, 'kobo "may".zip');
    const disposition = new URL(url).searchParams.get("response-content-disposition");
    expect(disposition).toBe('attachment; filename="kobo _may_.zip"');
  });
});
