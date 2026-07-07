"use client";

/**
 * WaaP (Wallet as a Protocol, human.tech) wagmi connector.
 *
 * WaaP gives people without a crypto wallet a way to create one in seconds —
 * signing in with their Bluesky account (the same identity they use here),
 * email, or another social login. No browser extension, no seed phrase; keys
 * are non-custodial (2PC) and recoverable through the login method.
 *
 * Adapted for wagmi v3 from the official example
 * (holonym-foundation/waap-examples → waap-wagmi-nextjs/src/waap.connector.ts).
 *
 * The connector is NOT registered in the shared wagmi config: RainbowKit owns
 * that surface for "connect an existing wallet". Instead, the "create a
 * wallet" CTAs call `connect({ connector: getWaaPConnector() })` — wagmi v3
 * accepts a CreateConnectorFn at connect time and sets it up on the fly. The
 * module-level singleton below guarantees `initWaaP` runs only once per page
 * (it injects the WaaP iframe/modal into the DOM).
 */

import { ChainNotConfiguredError, createConnector } from "wagmi";
import { getAddress, SwitchChainError, UserRejectedRequestError } from "viem";
import {
  initWaaP,
  WAAP_METHOD,
  type InitWaaPOptions,
  type WaaPEthereumProviderInterface,
} from "@human.tech/waap-sdk";

/** Login options shown by the WaaP modal.
 *
 *  Bluesky ordering is a deliberate workaround for a WaaP iframe bug: the
 *  TOP-LEVEL social buttons launch the OAuth popup directly, which for
 *  Bluesky produces `handle=undefined` and a blank page (Bluesky OAuth needs
 *  the handle to resolve the user's PDS). The "See all methods" sheet is the
 *  only path with the proper "Sign in with Bluesky" handle prompt — and only
 *  the first two socials render top-level. Listing google + discord first
 *  pushes Bluesky into the sheet, where it works. Do not reorder until
 *  human.tech fixes the top-level Bluesky button. */
const WAAP_INIT_OPTIONS: InitWaaPOptions = {
  useStaging: false,
  config: {
    authenticationMethods: ["social", "email"],
    allowedSocials: ["google", "discord", "bluesky"],
    styles: { darkMode: false },
    showSecured: true,
  },
  project: {
    name: "GainForest",
    entryTitle: "Create your donation wallet",
  },
};

function parseAddresses(values: unknown): `0x${string}`[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    try {
      return typeof value === "string" && value.trim() ? [getAddress(value)] : [];
    } catch {
      return [];
    }
  });
}

let sharedProvider: WaaPEthereumProviderInterface | null = null;

/** The lazily-initialised WaaP provider singleton. Also used by the wallet
 *  modal to observe WaaP's UI lifecycle (its `login()` promise never settles
 *  when the user dismisses the WaaP card — only an internal `hide_modal`
 *  event fires — so callers watch that to reset their pending state). */
function getWaaPProvider(options: InitWaaPOptions = WAAP_INIT_OPTIONS): WaaPEthereumProviderInterface {
  if (!sharedProvider) sharedProvider = initWaaP(options);
  return sharedProvider;
}

/** The provider that actually holds the session's keys.
 *
 *  After a login, the WaaP SDK rebinds `window.waap` to whichever provider
 *  now owns the wallet — its own iframe for social/email logins, or the
 *  EXTERNAL wallet's provider (injected extension / WalletConnect) when the
 *  user signed in WITH a wallet. The original `initWaaP()` instance keeps
 *  routing every request into the iframe, which holds no key for wallet-based
 *  logins and rejects sign requests without ever showing any UI. All RPC
 *  requests must therefore go through `window.waap`, not the init instance.
 *  (Before any login `window.waap` IS the init instance, so this is always
 *  safe.) */
function getLiveWaaPProvider(options: InitWaaPOptions = WAAP_INIT_OPTIONS): WaaPEthereumProviderInterface {
  const base = getWaaPProvider(options);
  if (typeof window === "undefined") return base;
  const live = (window as { waap?: WaaPEthereumProviderInterface }).waap;
  return live ?? base;
}

/** Starts loading the WaaP iframe ahead of time. The SDK's iframe handshake
 *  (`pingIframe`) posts a single message with a 10s timeout — if the user
 *  clicks "create" before the iframe finished loading, that message is lost
 *  against a not-yet-navigated window (console shows a postMessage target-
 *  origin error) and the login can hang. Calling this when the wallet modal
 *  mounts gives the iframe a head start so the handshake lands. */
export function prewarmWaaP(): void {
  if (typeof window === "undefined") return;
  try {
    getWaaPProvider();
  } catch {
    // Non-fatal — the connect flow will retry initialisation on click.
  }
}

/** Force-hides WaaP's full-screen overlay (z-index 2147483647). Used as a
 *  safety net after errors/cancels so a wedged WaaP UI can never leave the
 *  whole page unclickable. */
export function forceHideWaaPUi(): void {
  if (typeof document === "undefined") return;
  const container = document.getElementById("waap-wallet-iframe-container");
  if (container && container.style.display !== "none") {
    container.style.display = "none";
  }
}

/** Runs `callback` when the WaaP card is dismissed while no login completed.
 *  Returns an unsubscribe function. */
export function onWaaPDismissed(callback: () => void): () => void {
  const provider = getWaaPProvider();
  const manager = (provider as { uiMessageManager?: { on: (e: string, f: () => void) => void; off?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void } }).uiMessageManager;
  if (!manager) return () => undefined;
  const onHide = () => {
    // On a successful login the card also hides — give the connection a beat
    // to materialise, then treat a still-disconnected provider as a cancel.
    setTimeout(() => {
      if (!provider.connected) callback();
    }, 600);
  };
  manager.on("hide_modal", onHide);
  return () => {
    (manager.off ?? manager.removeListener)?.call(manager, "hide_modal", onHide);
  };
}

function waapConnector(options: InitWaaPOptions) {
  const ensureProvider = (): WaaPEthereumProviderInterface => getWaaPProvider(options);
  // Requests must hit the live provider (see getLiveWaaPProvider) so signing
  // works when the user logged into WaaP with an external wallet.
  const liveProvider = (): WaaPEthereumProviderInterface => getLiveWaaPProvider(options);

  const getAccounts = async (): Promise<`0x${string}`[]> => {
    const waap = liveProvider();
    const accounts = await waap
      .request({ method: WAAP_METHOD.eth_accounts })
      .catch(() => []);
    return parseAddresses(accounts);
  };

  const getChainId = async (): Promise<number> => {
    const waap = liveProvider();
    const chainId = await waap.request({ method: WAAP_METHOD.eth_chainId });
    return Number(chainId);
  };

  return createConnector<WaaPEthereumProviderInterface>((config) => {
    const onAccountsChanged = (accounts: string[]) => {
      const valid = parseAddresses(accounts);
      if (valid.length > 0) config.emitter.emit("change", { accounts: valid });
      else config.emitter.emit("disconnect");
    };
    const onChainChanged = (chain: string) => {
      config.emitter.emit("change", { chainId: Number(chain) });
    };
    const onDisconnect = () => {
      config.emitter.emit("disconnect");
    };

    const switchChain = async ({ chainId }: { chainId: number }) => {
      const chain = config.chains.find((candidate) => candidate.id === chainId);
      if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());
      const waap = liveProvider();
      try {
        await waap.request({
          method: WAAP_METHOD.wallet_switchEthereumChain,
          params: [{ chainId: `0x${chain.id.toString(16)}` }],
        });
        config.emitter.emit("change", { chainId });
        return chain;
      } catch (error) {
        throw new SwitchChainError(error as Error);
      }
    };

    return {
      id: "waap",
      name: "WaaP (human.tech)",
      type: "waap",
      supportsSimulation: false,

      async connect(parameters = {}) {
        const { chainId, withCapabilities } = parameters as {
          chainId?: number;
          withCapabilities?: boolean;
        };
        const waap = ensureProvider();

        waap.removeListener("accountsChanged", onAccountsChanged);
        waap.removeListener("chainChanged", onChainChanged);
        waap.removeListener("disconnect", onDisconnect);
        waap.on("accountsChanged", onAccountsChanged);
        waap.on("chainChanged", onChainChanged);
        waap.on("disconnect", onDisconnect);

        if (!waap.connected) {
          try {
            await waap.login();
          } catch (error) {
            throw new UserRejectedRequestError(
              error instanceof Error ? error : new Error("WaaP login failed"),
            );
          }
        }

        let currentChainId = await getChainId();
        if (chainId && currentChainId !== chainId) {
          const chain = await switchChain({ chainId }).catch((error) => {
            if ((error as { code?: number }).code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }

        const accounts = await getAccounts();
        if (accounts.length === 0) {
          throw new UserRejectedRequestError(new Error("No WaaP account available"));
        }

        return {
          accounts: (withCapabilities
            ? accounts.map((address) => ({ address, capabilities: {} }))
            : accounts) as never,
          chainId: currentChainId,
        };
      },

      getAccounts,
      getChainId,

      async getProvider() {
        // wagmi calls provider.request(...) for signing — hand back the live
        // provider so sign requests reach the wallet that owns the keys.
        return liveProvider();
      },

      async isAuthorized() {
        try {
          const accounts = await getAccounts();
          return accounts.length > 0;
        } catch {
          return false;
        }
      },

      switchChain,

      async disconnect() {
        const waap = ensureProvider();
        await Promise.resolve(waap.logout()).catch(() => undefined);
        waap.removeListener("accountsChanged", onAccountsChanged);
        waap.removeListener("chainChanged", onChainChanged);
        waap.removeListener("disconnect", onDisconnect);
      },

      onAccountsChanged,
      onChainChanged,
      onDisconnect,
    };
  });
}

type WaaPConnectorFn = ReturnType<typeof waapConnector>;

let singleton: WaaPConnectorFn | null = null;

/** The shared WaaP connector factory. Pass to wagmi's `connect(...)`:
 *  `connectAsync({ connector: getWaaPConnector(), chainId: mainnet.id })`. */
export function getWaaPConnector(): WaaPConnectorFn {
  if (!singleton) singleton = waapConnector(WAAP_INIT_OPTIONS);
  return singleton;
}
