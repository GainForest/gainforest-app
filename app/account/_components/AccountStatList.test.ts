import { describe, expect, it } from "vitest";
import { accountStatTiles, type AccountStatCounts } from "./AccountStatList";

const counts: AccountStatCounts = {
  observations: 1_284,
  projects: 12,
  donations: 4,
  supporters: 9,
};

describe("accountStatTiles", () => {
  it("shows work and support activity without a deprecated Certs tile", () => {
    expect(accountStatTiles("mangaroa-farm.certified.app", "user", counts)).toEqual([
      { id: "observations", count: 1_284, href: "/account/mangaroa-farm.certified.app/observations" },
      { id: "projects", count: 12, href: "/account/mangaroa-farm.certified.app/projects" },
      { id: "donations", count: 4, href: "/account/mangaroa-farm.certified.app/donations" },
      { id: "supporters", count: 9, href: null },
    ]);
  });

  it("keeps received donations in the support tile rather than duplicating them", () => {
    const tiles = accountStatTiles("mangaroa-farm.certified.app", "organization", counts);

    expect(tiles).toHaveLength(3);
    expect(tiles.find((tile) => tile.id === "donations")).toBeUndefined();
    expect(tiles.at(-1)).toEqual({ id: "supporters", count: 9, href: null });
  });
});
