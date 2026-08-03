import { describe, expect, it } from "vitest";
import { accountStatTiles, type AccountStatCounts } from "./AccountStatList";

const counts: AccountStatCounts = {
  observations: 1_284,
  projects: 12,
  bumicerts: 7,
  donations: 4,
};

describe("accountStatTiles", () => {
  it("includes certificates and links every available user history", () => {
    expect(accountStatTiles("mangaroa-farm.certified.app", "user", counts)).toEqual([
      { id: "observations", count: 1_284, href: "/account/mangaroa-farm.certified.app/observations" },
      { id: "projects", count: 12, href: "/account/mangaroa-farm.certified.app/projects" },
      { id: "bumicerts", count: 7, href: "/account/mangaroa-farm.certified.app/certs" },
      { id: "donations", count: 4, href: "/account/mangaroa-farm.certified.app/donations" },
    ]);
  });

  it("keeps an organization's received donation count informative without a dead link", () => {
    const tiles = accountStatTiles("mangaroa-farm.certified.app", "organization", counts);

    expect(tiles).toHaveLength(4);
    expect(tiles.at(-1)).toEqual({ id: "donations", count: 4, href: null });
  });
});
