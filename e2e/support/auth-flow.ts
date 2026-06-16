import { expect, type Page, type TestInfo } from "@playwright/test";
import { screenshotStep } from "./artifacts";
import { getE2EEnv } from "./env";
import {
  createDisposableInbox,
  listDisposableEmailMessages,
  waitForInboxOtp,
  writeDisposableAccountMetadata,
  type DisposableInbox,
} from "./disposable-email";

function isAppUrl(url: string, appUrl: string): boolean {
  return new URL(url).origin === new URL(appUrl).origin;
}

function isExpectedOAuthUrl(url: URL, appUrl: string, expectedHost: string | null): boolean {
  const appHost = new URL(appUrl).hostname;
  const isExpectedHost = expectedHost
    ? url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`)
    : url.hostname !== appHost;

  return isExpectedHost;
}

function assertSafeAuthenticatedBaseUrl(appUrl: string): void {
  const url = new URL(appUrl);
  if (url.hostname === "local.gainforest.app") {
    throw new Error(
      "Authenticated E2E must not run against local.gainforest.app because that may be a developer's active dev server. Use https://local-e2e.gainforest.app instead.",
    );
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".gainforest.app")) {
    throw new Error(
      `Authenticated E2E must run through an HTTPS gainforest.app host so sign-in cookies match production behavior. Got ${appUrl}. For local runs, use https://local-e2e.gainforest.app.`,
    );
  }
}

async function clickFirstVisible(page: Page, labels: RegExp[], timeoutMs = 2_500): Promise<boolean> {
  for (const label of labels) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.isVisible({ timeout: timeoutMs }).catch(() => false)) {
      const beforeUrl = page.url();
      try {
        await button.click({ noWaitAfter: true, timeout: 10_000 });
      } catch (error) {
        if (page.url() === beforeUrl) throw error;
      }
      return true;
    }
  }
  return false;
}

async function waitForSignedInSession(page: Page): Promise<{ did: string; handle: string }> {
  let latest: unknown = null;
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/session").catch(() => null);
        if (!response?.ok()) return false;
        latest = await response.json().catch(() => null) as unknown;
        return getSession(latest) !== null;
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
    )
    .toBe(true);

  const session = getSession(latest);
  if (!session) throw new Error(`Signed-in session response had an unexpected shape: ${JSON.stringify(latest)}`);
  return session;
}

function getSession(value: unknown): { did: string; handle: string } | null {
  if (typeof value !== "object" || value === null || !("session" in value)) return null;
  const session = value.session;
  if (
    typeof session === "object" &&
    session !== null &&
    "isLoggedIn" in session &&
    session.isLoggedIn === true &&
    "did" in session &&
    typeof session.did === "string" &&
    "handle" in session &&
    typeof session.handle === "string"
  ) {
    return { did: session.did, handle: session.handle };
  }
  return null;
}

async function resolveServiceEndpoint(did: string, fallbackDomain: string | null): Promise<string | null> {
  const fallback = fallbackDomain ? `https://${fallbackDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null;

  const readDidDocument = async (url: string): Promise<unknown> => {
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) return null;
    return response.json().catch(() => null) as Promise<unknown>;
  };

  let document: unknown = null;
  if (did.startsWith("did:plc:")) {
    document = await readDidDocument(`https://plc.directory/${encodeURIComponent(did)}`);
  } else if (did.startsWith("did:web:")) {
    const host = did.slice("did:web:".length).replace(/:/g, "/");
    document = await readDidDocument(`https://${host}/.well-known/did.json`);
  }

  if (typeof document === "object" && document !== null && "service" in document && Array.isArray(document.service)) {
    for (const service of document.service) {
      if (typeof service !== "object" || service === null || !("serviceEndpoint" in service)) continue;
      if (typeof service.serviceEndpoint === "string") return service.serviceEndpoint.replace(/\/$/, "");
    }
  }

  return fallback;
}

async function openConfiguredLogin(page: Page, returnToPath: string, identifier: { handle?: string; email?: string }): Promise<void> {
  const env = getE2EEnv();
  const appUrl = env.appUrl.replace(/\/$/, "");
  const completionUrl = new URL("/auth/complete", appUrl);
  completionUrl.searchParams.set("redirect", returnToPath);

  const loginUrl = new URL("/login", env.authBaseUrl);
  loginUrl.searchParams.set("returnTo", completionUrl.toString());
  loginUrl.searchParams.set("provider", process.env.NEXT_PUBLIC_AUTH_PROVIDER ?? "certs");
  if (identifier.handle) loginUrl.searchParams.set("handle", identifier.handle);
  if (identifier.email) loginUrl.searchParams.set("email", identifier.email);
  await page.goto(loginUrl.toString(), { waitUntil: "domcontentloaded" });
}

async function fillPasswordIfVisible(page: Page, password: string): Promise<boolean> {
  const passwordInput = page.locator('input[type="password"]').first();
  if (!(await passwordInput.isVisible({ timeout: 45_000 }).catch(() => false))) return false;

  await passwordInput.fill(password);
  return true;
}

async function fillIdentifierIfVisible(page: Page, handle: string): Promise<void> {
  const identifier = page
    .locator('input[type="email"], input[name*="identifier" i], input[name*="handle" i], input[name*="login" i], input[autocomplete="username"]')
    .first();
  if (await identifier.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const current = await identifier.inputValue().catch(() => "");
    if (!current.trim()) await identifier.fill(handle);
  }
}

async function fillOtp(page: Page, otp: string): Promise<void> {
  const digitInputs = page.getByRole("textbox", { name: /digit/i });
  if ((await digitInputs.count()) >= otp.length) {
    for (let index = 0; index < otp.length; index += 1) {
      await digitInputs.nth(index).fill(otp[index] ?? "");
    }
    return;
  }

  const otpInputs = page
    .locator('input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="code" i], input[id*="otp" i], input[id*="code" i]')
    .filter({ visible: true });
  if ((await otpInputs.count()) >= otp.length) {
    for (let index = 0; index < otp.length; index += 1) {
      await otpInputs.nth(index).fill(otp[index] ?? "");
    }
    return;
  }

  const first = otpInputs.first();
  if (await first.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await first.fill(otp);
    return;
  }

  throw new Error("Could not find a visible one-time-code input.");
}

async function finishOAuthRedirect(page: Page, appUrl: string, testInfo: TestInfo): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);

  const authorizeButton = page.getByRole("button", { name: /^authorize$/i }).first();
  const outcome = await Promise.race([
    authorizeButton.waitFor({ state: "visible", timeout: 90_000 }).then(() => "consent" as const).catch(() => "timeout" as const),
    page.waitForURL((url) => isAppUrl(url.toString(), appUrl), { timeout: 90_000 }).then(() => "app" as const).catch(() => "timeout" as const),
  ]);

  if (outcome === "consent") {
    await screenshotStep(page, testInfo, "auth-consent-page");
    await authorizeButton.click();
    await page.waitForURL((url) => isAppUrl(url.toString(), appUrl), { timeout: 60_000 });
  } else if (outcome !== "app") {
    await page.waitForURL((url) => isAppUrl(url.toString(), appUrl), { timeout: 60_000 });
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await waitForSignedInSession(page);
  await screenshotStep(page, testInfo, "auth-complete-signed-in");
}

export async function signInWithConfiguredAccount(page: Page, testInfo: TestInfo): Promise<void> {
  const env = getE2EEnv();
  assertSafeAuthenticatedBaseUrl(env.appUrl);

  if (!env.testHandle || !env.testPassword) {
    throw new Error("E2E_TEST_HANDLE and E2E_TEST_PASSWORD are required for configured-account auth smoke tests.");
  }

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await screenshotStep(page, testInfo, "home-signed-out");
  await openConfiguredLogin(page, "/manage", { handle: env.testHandle });
  await screenshotStep(page, testInfo, "auth-handle-login-started");

  if (!isExpectedOAuthUrl(new URL(page.url()), env.appUrl, env.testPdsDomain)) {
    await page.waitForURL(
      (url) => isExpectedOAuthUrl(url, env.appUrl, env.testPdsDomain),
      { timeout: 60_000, waitUntil: "domcontentloaded" },
    );
  }
  await screenshotStep(page, testInfo, "auth-provider-password-page");

  await fillIdentifierIfVisible(page, env.testHandle);
  const didFillPassword = await fillPasswordIfVisible(page, env.testPassword);
  if (didFillPassword) {
    await screenshotStep(page, testInfo, "auth-password-filled");
    await clickFirstVisible(page, [/^sign in$/i, /^continue$/i, /next/i, /submit/i], 5_000);
  }

  await finishOAuthRedirect(page, env.appUrl, testInfo);
}

export async function signInWithDisposableEmailAccount(page: Page, testInfo: TestInfo): Promise<void> {
  const env = getE2EEnv();
  assertSafeAuthenticatedBaseUrl(env.appUrl);

  const inbox = await createDisposableInbox();
  console.log(`[e2e] Created disposable inbox ${inbox.email}.`);
  await writeDisposableAccountMetadata({
    source: "disposable-email-auth",
    createdAt: new Date().toISOString(),
    email: inbox.email,
    inbox,
    did: null,
    handle: null,
    serviceEndpoint: "https://certified.one",
  });
  const beforeMessages = new Set((await listDisposableEmailMessages(inbox)).map((message) => message.id));

  await openConfiguredLogin(page, "/manage", { email: inbox.email });
  await screenshotStep(page, testInfo, "auth-disposable-email-started");

  if (await page.getByRole("heading", { name: /enter your code/i }).isVisible({ timeout: 45_000 }).catch(() => false)) {
    const otp = await waitForInboxOtp(inbox, beforeMessages);
    await fillOtp(page, otp);
    await screenshotStep(page, testInfo, "auth-disposable-code-filled");
  }

  await finishOAuthRedirect(page, env.appUrl, testInfo);
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  const session = await waitForSignedInSession(page);
  const serviceEndpoint = await resolveServiceEndpoint(session.did, env.testPdsDomain);

  await writeDisposableAccountMetadata({
    source: "disposable-email-auth",
    createdAt: new Date().toISOString(),
    email: inbox.email,
    inbox,
    did: session.did,
    handle: session.handle,
    serviceEndpoint,
  });

  await screenshotStep(page, testInfo, "auth-disposable-complete-signed-in");
}

export type { DisposableInbox };
