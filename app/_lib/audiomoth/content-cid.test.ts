import { describe, expect, it } from "vitest";
import { base32Encode, cidForBytes } from "./content-cid";

describe("base32Encode", () => {
  it("encodes RFC 4648 test vectors (lowercase, unpadded)", () => {
    const enc = (s: string) => base32Encode(new TextEncoder().encode(s));
    expect(enc("")).toBe("");
    expect(enc("f")).toBe("my");
    expect(enc("fo")).toBe("mzxq");
    expect(enc("foo")).toBe("mzxw6");
    expect(enc("foobar")).toBe("mzxw6ytboi");
  });
});

describe("cidForBytes", () => {
  it("produces the canonical raw CID for empty bytes", async () => {
    // Well-known CIDv1 raw/sha-256 of zero bytes.
    expect(await cidForBytes(new Uint8Array(0))).toBe("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku");
  });

  it("produces the canonical raw CID for 'hello world'", async () => {
    expect(await cidForBytes(new TextEncoder().encode("hello world"))).toBe(
      "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e",
    );
  });

  it("is deterministic and shaped like an atproto blob CID", async () => {
    const bytes = new TextEncoder().encode("audiomoth");
    const a = await cidForBytes(bytes);
    const b = await cidForBytes(bytes);
    expect(a).toBe(b);
    expect(a.startsWith("bafkrei")).toBe(true);
    expect(a).toHaveLength(59);
  });
});
