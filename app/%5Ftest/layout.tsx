import type { Metadata } from "next";

const robots = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  nocache: true,
} as const;

/** Every registry page and experience subroute is excluded from indexing. */
export const metadata: Metadata = {
  robots: {
    ...robots,
    googleBot: robots,
  },
};

export default function TestRegistryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
