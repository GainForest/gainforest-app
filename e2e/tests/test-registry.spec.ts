import { expect, test } from "@playwright/test";

const FORBIDDEN_DONATION_PATHS = new Set([
  "/api/checkout",
  "/api/fund",
  "/api/tip",
  "/api/verify-recipient",
]);

const WHATS_NEW_STORAGE_KEY = "gainforest.floatingTaina.whatsNewSeen.v1";
const WHATS_NEW_RELEASE_ID = "2026-07-06";

test("Tainá's What's New is prominent once and stays available", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const setupKey = `${storageKey}.prominentE2ePrepared`;
    if (window.sessionStorage.getItem(setupKey)) return;
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.setItem(setupKey, "1");
  }, WHATS_NEW_STORAGE_KEY);

  await page.goto("/_test");

  const newUpdatesTrigger = page.getByRole("button", {
    name: "See new updates in GainForest",
    exact: true,
  });
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toBeVisible();
  await expect(newUpdatesTrigger).toBeVisible();

  const otherPage = await page.context().newPage();
  await otherPage.goto("/_test");
  await expect(otherPage.getByRole("status").filter({ hasText: "What's new" })).toBeVisible();

  await newUpdatesTrigger.click();

  await expect(otherPage.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);
  await expect(otherPage.getByRole("button", {
    name: "See what's new in GainForest",
    exact: true,
  })).toBeVisible();
  await otherPage.close();

  await expect(page.getByRole("heading", { name: "What's new", exact: true })).toBeVisible();
  await expect(page.getByText("Choose a common question and Tainá can point to the right places on your screen.", { exact: true })).toBeVisible();
  await expect(page.getByText("A few things just got better", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), WHATS_NEW_STORAGE_KEY))
    .toBe(WHATS_NEW_RELEASE_ID);

  await page.getByRole("button", { name: "Close chat", exact: true }).click();
  const seenUpdatesTrigger = page.getByRole("button", {
    name: "See what's new in GainForest",
    exact: true,
  });
  await expect(seenUpdatesTrigger).toBeFocused();

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);
  await expect(seenUpdatesTrigger).toBeVisible();

  await seenUpdatesTrigger.click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByPlaceholder("Ask me anything…")).toBeFocused();
  await page.getByRole("button", { name: "Close chat", exact: true }).click();
});

test("closing or minimizing What's New keeps it dismissed", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    const setupKey = `${storageKey}.dismissE2ePrepared`;
    if (window.sessionStorage.getItem(setupKey)) return;
    window.localStorage.removeItem(storageKey);
    window.sessionStorage.setItem(setupKey, "1");
  }, WHATS_NEW_STORAGE_KEY);

  await page.goto("/_test");
  await page.getByRole("button", { name: "Dismiss What's new", exact: true }).click();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), WHATS_NEW_STORAGE_KEY))
    .toBe(WHATS_NEW_RELEASE_ID);
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);

  await page.evaluate((key) => window.localStorage.removeItem(key), WHATS_NEW_STORAGE_KEY);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toBeVisible();

  const sprite = page.locator('[role="button"][aria-label="Tainá — click to chat, drag to move"]');
  await sprite.hover();
  await page.getByRole("button", { name: "Minimize Tainá", exact: true }).click();
  const restoreTaina = page.getByRole("button", { name: "Open Tainá", exact: true });
  await expect(restoreTaina).toBeFocused();
  await restoreTaina.click();
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "What's new" })).toHaveCount(0);
});

test("What's New and Did you know remain separate", async ({ page }) => {
  await page.addInitScript(({ whatsNewKey }) => {
    window.localStorage.removeItem(whatsNewKey);
    window.localStorage.removeItem("gainforest.floatingTaina.tipLastShown.v1");
    window.localStorage.removeItem("gainforest.floatingTaina.tipSnoozeUntil.v1");
    window.sessionStorage.removeItem("gainforest.floatingTaina.tipSessionCount.v1");
    Math.random = () => 0.9;
  }, { whatsNewKey: WHATS_NEW_STORAGE_KEY });

  await page.goto("/_test");
  const whatsNew = page.getByRole("status").filter({ hasText: "What's new" });
  await expect(whatsNew).toBeVisible();

  const didYouKnow = page.getByRole("status").filter({ hasText: "Did you know?" });
  await expect(didYouKnow).toBeVisible({ timeout: 25_000 });
  await expect(whatsNew).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(2);

  await page.getByRole("button", { name: "Dismiss tip", exact: true }).click();
  await expect(whatsNew).toBeVisible();
  await expect(didYouKnow).toHaveCount(0);
});

test("signed-out card galleries ignore browser-injected collectibles", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("gainforest.reward-cards.v1:guest", JSON.stringify([{ title: "Fake card" }]));
  });

  await page.goto("/cards");
  await expect(page.getByRole("heading", { name: "My Cards", exact: true })).toBeVisible();
  await expect(page.getByText("Sign in to see your cards", { exact: true })).toBeVisible();
  await expect(page.getByText("Fake card", { exact: true })).toHaveCount(0);
});

test("donation registry mirrors the production flow without live side effects", async ({ page }) => {
  const productionCartSnapshot = JSON.stringify({
    items: [{
      kind: "project",
      orgDid: "did:plc:existingcartowner",
      rkey: "existing-project",
      title: "Existing production cart item",
      orgName: "Existing organization",
      image: null,
      amountUsd: 12,
      minUsd: null,
      maxUsd: null,
    }],
    tipPercent: 17,
  });
  await page.addInitScript(({ cartSnapshot }) => {
    window.localStorage.setItem("gainforest.donation-cart.v1", cartSnapshot);
    Reflect.set(window, "__testRegistryWalletCalls", []);
    Reflect.set(window, "ethereum", {
      request: async ({ method }: { method: string }) => {
        const calls = Reflect.get(window, "__testRegistryWalletCalls") as string[];
        calls.push(method);
        throw new Error(`The mock registry called the live wallet method ${method}`);
      },
    });
  }, { cartSnapshot: productionCartSnapshot });

  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (FORBIDDEN_DONATION_PATHS.has(pathname)) {
      forbiddenRequests.push(`${request.method()} ${pathname}`);
    }
  });

  const response = await page.goto("/_test");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  await expect(page.getByRole("heading", { name: "UI experience registry" })).toBeVisible();
  await expect(page.getByText("Parity contract", { exact: true })).toBeVisible();
  await expect(page.getByText(/Developers and AI agents:/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Donation flow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Donate", exact: true })).toHaveCount(0);

  await page.locator('a[href="/_test/donation-flow"]').click();
  await expect(page).toHaveURL(/\/_test\/donation-flow$/);
  await expect(page.getByRole("heading", { name: "Donation flow", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Parity contract", { exact: true })).toBeVisible();

  const experienceResponse = await page.request.get("/_test/donation-flow");
  expect(experienceResponse.headers()["x-robots-tag"]).toContain("noindex");
  expect(experienceResponse.headers()["cache-control"]).toContain("no-store");

  await page.getByRole("button", { name: "Donate", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Support this project" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByRole("heading", { name: "Cart", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();

  await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: /Donate \$203\.50 now/ })).toBeEnabled();
  await page.getByRole("button", { name: /Donate \$203\.50 now/ }).click();

  await expect(page.getByText("Thank you", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Your $203.50 in donations was completed successfully.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collect all (3)" })).toBeVisible();

  // Every flight must have its own painted mouth mask before its gulp begins.
  // This catches the multi-card regression where only the final card clipped.
  await page.evaluate(() => {
    const audit: Array<{ cardId: string; overflow: string; height: number }> = [];
    const seen = new Set<string>();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target;
        if (!(target instanceof HTMLElement) || target.dataset.phase !== "gulp") continue;
        const cardId = target.dataset.cardId ?? "";
        if (!cardId || seen.has(cardId)) continue;
        seen.add(cardId);
        audit.push({
          cardId,
          overflow: target.style.overflow,
          height: Number.parseFloat(target.style.height),
        });
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-phase"] });
    Reflect.set(window, "__rewardMaskAudit", audit);
    Reflect.set(window, "__rewardMaskObserver", observer);
  });

  await page.getByRole("button", { name: "Collect all (3)" }).click();
  await expect(page.getByText("All collected!", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "View My Cards" })).toHaveAttribute("href", "/_test/my-cards");
  const rewardMaskAudit = await page.evaluate(() => {
    const observer = Reflect.get(window, "__rewardMaskObserver") as MutationObserver;
    observer.disconnect();
    return Reflect.get(window, "__rewardMaskAudit") as Array<{ cardId: string; overflow: string; height: number }>;
  });
  expect(rewardMaskAudit).toHaveLength(3);
  expect(rewardMaskAudit.every((entry) => entry.overflow === "hidden" && entry.height > 0)).toBe(true);

  const safetyState = await page.evaluate(() => ({
    cart: window.localStorage.getItem("gainforest.donation-cart.v1"),
    walletCalls: Reflect.get(window, "__testRegistryWalletCalls") as string[],
  }));
  expect(safetyState.cart).toBe(productionCartSnapshot);
  expect(safetyState.walletCalls).toEqual([]);
  expect(forbiddenRequests).toEqual([]);

  await page.getByRole("link", { name: "View My Cards" }).click();
  await expect(page).toHaveURL(/\/_test\/my-cards$/);
  await expect(page.getByRole("heading", { name: "My Cards", exact: true })).toBeVisible();
  await expect(page.getByText("Cloud Forest Corridor", { exact: true }).first()).toBeVisible();

  const robotsResponse = await page.request.get("/robots.txt");
  const robotsText = await robotsResponse.text();
  expect(robotsText).toContain("Disallow: /_test");
  expect(robotsText).toContain("Disallow: /*/_test");
});
