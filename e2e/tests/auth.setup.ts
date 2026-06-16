import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { test, type Page } from "@playwright/test";
import { attachPageVideo } from "../support/artifacts";
import { signInWithDisposableEmailAccount } from "../support/auth-flow";
import { disposableAccountMetadataPath } from "../support/disposable-email";

const authStatePath = "e2e/.auth/user.json";

test("creates disposable email browser state", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  await rm(authStatePath, { force: true });
  await rm(disposableAccountMetadataPath, { force: true });

  const videoDir = testInfo.outputPath("manual-context-videos");
  await mkdir(videoDir, { recursive: true });

  const disposableContext = await browser.newContext({ recordVideo: { dir: videoDir } });
  let disposablePage: Page | null = null;
  try {
    disposablePage = await disposableContext.newPage();
    await signInWithDisposableEmailAccount(disposablePage, testInfo);
    await mkdir(dirname(authStatePath), { recursive: true });
    await disposableContext.storageState({ path: authStatePath });
  } finally {
    await disposableContext.close();
    if (disposablePage) await attachPageVideo(disposablePage, testInfo, "disposable-email-auth");
  }
});
