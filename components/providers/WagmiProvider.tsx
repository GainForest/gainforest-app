"use client";

/**
 * WagmiProvider — configures wallet connection for Base mainnet.
 *
 * Uses RainbowKit's getDefaultConfig which bundles WalletConnect,
 * MetaMask, Coinbase Wallet, Rainbow, and other popular wallets.
 * WalletConnect is required for mobile wallet support (deep-links into
 * wallet apps), since injected connectors don't exist in mobile browsers.
 *
 * RainbowKitProvider is included so useConnectModal() is available
 * throughout the app. RainbowKit renders its connect modal as a top-level
 * portal — outside our app's modal DOM tree — so there is no z-index or
 * focus-trap conflict with our custom modal system.
 */

import { createStorage, WagmiProvider as WagmiProviderBase } from "wagmi";
import { base } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getDefaultConfig,
  RainbowKitProvider,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { useMemo, useState } from "react";
import { WALLETCONNECT_PROJECT_ID } from "@/app/_lib/urls";

const noopWalletStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const getWalletStorage = () => {
  if (typeof window === "undefined") return noopWalletStorage;

  const storage = window.localStorage;
  if (
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return noopWalletStorage;
  }

  return storage;
};

function WagmiClientProvider({ children }: { children: React.ReactNode }) {
  const [wagmiQueryClient] = useState(() => new QueryClient());

  const wagmiConfig = useMemo(
    () =>
      getDefaultConfig({
        appName: "GainForest",
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [base],
        ssr: true,
        storage: createStorage({ storage: getWalletStorage() }),
      }),
    []
  );

  return (
    <WagmiProviderBase config={wagmiConfig}>
      <QueryClientProvider client={wagmiQueryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "var(--primary)",
            accentColorForeground: "var(--primary-foreground)",
            borderRadius: "medium",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProviderBase>
  );
}

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  return <WagmiClientProvider>{children}</WagmiClientProvider>;
}
