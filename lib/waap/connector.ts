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

/** Login options shown by the WaaP modal. Bluesky first — every steward
 *  already has that identity — with email and Google as fallbacks. */
const WAAP_INIT_OPTIONS: InitWaaPOptions = {
  useStaging: false,
  config: {
    authenticationMethods: ["social", "email"],
    allowedSocials: ["bluesky", "google"],
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

function waapConnector(options: InitWaaPOptions) {
  let provider: WaaPEthereumProviderInterface | null = null;

  const ensureProvider = (): WaaPEthereumProviderInterface => {
    if (!provider) provider = initWaaP(options);
    return provider;
  };

  const getAccounts = async (): Promise<`0x${string}`[]> => {
    const waap = ensureProvider();
    const accounts = await waap
      .request({ method: WAAP_METHOD.eth_accounts })
      .catch(() => []);
    return parseAddresses(accounts);
  };

  const getChainId = async (): Promise<number> => {
    const waap = ensureProvider();
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
      const waap = ensureProvider();
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
        return ensureProvider();
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
 *  `connectAsync({ connector: getWaaPConnector(), chainId: base.id })`. */
export function getWaaPConnector(): WaaPConnectorFn {
  if (!singleton) singleton = waapConnector(WAAP_INIT_OPTIONS);
  return singleton;
}
