import { describe, expect, it, vi } from "vitest";
import type { OccurrenceRecord } from "@/app/_lib/indexer";

vi.mock("server-only", () => ({}));
import {
  buildWinnerInfoMarkdown,
  createPinnedPdsLookup,
  extensionForImageContentType,
  isPublicAddress,
  winnerPackageFilename,
} from "./bioblitz-winner-package";

const OBSERVATION = {
  scientificName: "Ara macao",
  vernacularName: "Scarlet macaw",
  createdAt: "2025-05-04T10:30:00.000Z",
  locality: "Cloud Forest Reserve",
  stateProvince: null,
  country: "Ecuador",
  remarks: "Seen near a fruiting tree | with two juveniles",
} as OccurrenceRecord;

describe("BioBlitz winner packages", () => {
  it("uses clear, marketing-ready archive filenames", () => {
    expect(winnerPackageFilename(12, "most-observations")).toBe("Round 12 Most Observations Winner.zip");
    expect(winnerPackageFilename(12, "best-picture")).toBe("Round 12 Best Picture Winner.zip");
  });

  it("only accepts known image content types and public network addresses", () => {
    expect(extensionForImageContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(extensionForImageContentType("text/html")).toBeNull();
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("10.0.0.8")).toBe(false);
    expect(isPublicAddress("100.64.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("172.16.0.1")).toBe(false);
    expect(isPublicAddress("192.168.1.1")).toBe(false);
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    expect(isPublicAddress("0:0:0:0:0:0:0:1")).toBe(false);
    expect(isPublicAddress("fec0::1")).toBe(false);
    expect(isPublicAddress("fd00::1")).toBe(false);
    expect(isPublicAddress("ff02::1")).toBe(false);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("not-an-ip")).toBe(false);
  });

  it("returns an address list when Node requests all pinned PDS candidates", async () => {
    const lookup = createPinnedPdsLookup("203.0.113.9", 4);
    const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
      (lookup as unknown as (
        hostname: string,
        options: { all: true },
        callback: (error: Error | null, result: Array<{ address: string; family: number }>) => void,
      ) => void)("pds.example", { all: true }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    expect(addresses).toEqual([{ address: "203.0.113.9", family: 4 }]);
  });

  it("maps packaged files to concise observation data in info.md", () => {
    const info = buildWinnerInfoMarkdown({
      round: { id: 12, start: "2025-05-02T00:00:00.000Z", end: "2025-05-08T23:59:59.999Z" },
      prize: "best-picture",
      winner: {
        displayName: "River Collective",
        observationCount: 38,
        winningLikeCount: 14,
        winningObservationUri: "at://did:plc:river/app.gainforest.dwc.occurrence/winning-picture",
      },
      profileFilename: "profile.jpg",
      observations: [{ filename: "observations/01.jpg", record: OBSERVATION, likeCount: 14 }],
      skipped: ["Unidentified\nwith a line break"],
    });

    expect(info).toContain("# Round 12 Best Picture Winner");
    expect(info).toContain("Profile image: profile.jpg");
    expect(info).toContain("| observations/01.jpg | Ara macao | 2025-05-04 | Cloud Forest Reserve, Ecuador | 14 | Seen near a fruiting tree with two juveniles |");
    expect(info).toContain("- Unidentified with a line break");
    expect(info).toContain("The confirmed winning picture is first when it is available.");
  });
});
