import { expect, test } from "@playwright/test";

test("shared modals use a dismissible bottom sheet on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/feed");

  const trigger = page.locator("[data-header]").getByRole("button", { name: "Sign in", exact: true });
  await trigger.click();

  const drawer = page.locator('[data-slot="drawer-content"]');
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("shared desktop dialogs keep a viewport gutter and restore focus", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto("/feed");

  const trigger = page.locator("[data-header]").getByRole("button", { name: "Sign in", exact: true });
  await trigger.click();

  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(800 - box!.x - box!.width).toBeGreaterThanOrEqual(12);

  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("account headers stay compact while Overview owns profile details", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const accountPath = "/account/t0fl10.certified.one";

  // Every tab shares one compact header — photo, name, facts, website, actions,
  // and trust. The Overview carries the description, social links, and details.
  await page.goto(`${accountPath}/observations`);
  const hero = page.locator("[data-account-hero]");
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("link", { name: /beesandtreesug\.org/i })).toBeVisible();
  await expect(page.locator("[data-account-about]")).toHaveCount(0);
  await expect(page.locator("[data-account-overview-panel]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /(?:show|hide) profile/i })).toHaveCount(0);

  await page.goto(accountPath);
  await expect(hero).toBeVisible();
  // A short bio lives exactly once: first inside At a glance, never in a
  // duplicate About section. Longer account stories still render there.
  const about = page.locator("[data-account-about]");
  const stream = page.getByRole("heading", { name: /recent activity/i });
  await expect(about).toHaveCount(0);
  await expect(stream).toBeVisible();

  const profilePanel = page.locator("[data-account-overview-panel]");
  await expect(profilePanel).toBeVisible();
  const atAGlance = profilePanel.locator("[data-account-stat-tiles]");
  const atAGlanceHeading = atAGlance.getByRole("heading", { name: /at a glance/i });
  await expect(atAGlanceHeading).toBeVisible();
  await expect(atAGlanceHeading).toHaveClass(/font-instrument/);
  await expect(atAGlanceHeading).toHaveClass(/italic/);
  await expect(atAGlance.locator("[data-account-overview-bio]")).toBeVisible();
  // Support is a two-column tile within At a glance whenever this account can
  // receive support; it is never an unrelated rail block.
  await expect(profilePanel.locator(":scope > [data-account-overview-support]")).toHaveCount(0);
  await expect(atAGlance.locator("[data-account-stat-tile]")).toHaveCount(3);
  await expect(atAGlance.locator("[data-account-stat-tile] svg")).toHaveCount(3);
  await expect(atAGlance.locator('[data-account-stat-tile="bumicerts"]')).toHaveCount(0);
  await expect(atAGlance.locator('[data-account-stat-tile="supporters"]')).toBeVisible();
  await expect(atAGlance.locator('[data-account-overview-tile="website"]')).toHaveCount(0);

  // Audience counts belong immediately below Follow + share — not in the rail's
  // work/funding tiles.
  const share = hero.getByRole("button", { name: /copy link to this profile/i });
  const followers = hero.getByRole("link", { name: /followers/i });
  await expect(share).toBeVisible();
  await expect(followers).toBeVisible();
  const [shareBox, followersBox] = await Promise.all([share.boundingBox(), followers.boundingBox()]);
  expect(shareBox).not.toBeNull();
  expect(followersBox).not.toBeNull();
  expect(followersBox!.y).toBeGreaterThanOrEqual(shareBox!.y + shareBox!.height);
  await expect(profilePanel.getByRole("link", { name: /followers/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /(?:show|hide) profile/i })).toHaveCount(0);
});

test("account Overview stacks its supporting rail before the wide desktop layout", async ({ page }) => {
  const accountPath = "/account/t0fl10.certified.one";

  for (const width of [320, 390, 1024, 1172]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(accountPath);

    const projects = page.getByRole("heading", { name: "Projects", exact: true });
    const profilePanel = page.locator("[data-account-overview-panel]");
    await expect(projects).toBeVisible();
    await expect(profilePanel).toBeVisible();

    const [projectsBox, railBox] = await Promise.all([projects.boundingBox(), profilePanel.boundingBox()]);
    expect(projectsBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect(railBox!.y).toBeGreaterThan(projectsBox!.y);

    // Below the wide two-column breakpoint, the supporting rail occupies the
    // same content line as Projects. Its available-width grid must align to
    // that section and fit more than two stats across when the space permits.
    if (width === 1172) {
      const statTiles = profilePanel.locator("[data-account-stat-tile]");
      await expect(statTiles).toHaveCount(3);
      await expect(statTiles.nth(0)).toHaveClass(/justify-between/);
      await expect(statTiles.nth(0)).toHaveClass(/bg-muted/);
      await expect(statTiles.nth(0)).not.toHaveClass(/(?:border|shadow)/);
      await expect(statTiles.nth(0).locator(".font-instrument")).toHaveClass(/italic/);
      await expect(statTiles.nth(0).locator("svg")).toHaveClass(/size-16/);
      await expect(statTiles.nth(0).locator("svg")).toHaveClass(/text-primary/);
      await expect(statTiles.nth(0).locator("svg")).toHaveClass(/opacity-10/);
      await expect(statTiles.nth(0).locator("svg")).toHaveClass(/-bottom-3/);
      await expect(statTiles.nth(0).locator("svg")).toHaveClass(/-left-3/);
      await expect(statTiles.nth(0).locator("svg")).not.toHaveClass(/rotate/);
      await expect(statTiles.nth(0).getByText("Observations", { exact: true })).toHaveClass(/text-left/);
      await expect(statTiles.nth(0).locator(".font-instrument")).toHaveClass(/text-right/);
      await expect(profilePanel.locator('[data-account-stat-tile="donations"]')).toHaveCount(0);
      const [firstTile, secondTile, thirdTile] = await Promise.all([
        statTiles.nth(0).boundingBox(),
        statTiles.nth(1).boundingBox(),
        statTiles.nth(2).boundingBox(),
      ]);
      expect(firstTile).not.toBeNull();
      expect(secondTile).not.toBeNull();
      expect(thirdTile).not.toBeNull();
      expect(secondTile!.y).toBe(firstTile!.y);
      expect(thirdTile!.y).toBe(firstTile!.y);
      expect(firstTile!.x).toBeGreaterThanOrEqual(railBox!.x);
      expect(firstTile!.x - railBox!.x).toBeLessThanOrEqual(2);
      expect(Math.abs(projectsBox!.x - firstTile!.x)).toBeLessThanOrEqual(2);
    }

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
});

test("BioBlitz stays within narrow viewports and keeps registration concise", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/bioblitz");
    await expect(page.getByRole("heading", { name: /BioBlitz/i, level: 1 })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }

  await expect(page.getByRole("heading", { name: "Your data does more than win prizes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "BioBlitz Terms" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText("Register so we can track your entries and send your prize if you win.", { exact: true })).toHaveCount(0);
});
