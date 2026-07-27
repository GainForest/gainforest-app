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

  await expect(page.getByRole("link", { name: "BioBlitz Terms" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText("Register so we can track your entries and send your prize if you win.", { exact: true })).toHaveCount(0);
});
