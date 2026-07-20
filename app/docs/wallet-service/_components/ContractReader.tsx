"use client";

// Three short excerpts from the real Splits smart-vaults contracts, each
// paired with a plain-language margin note. The code is quoted verbatim
// from 0xSplits/splits-contracts-monorepo (packages/smart-vaults).

import { useTranslations } from "next-intl";

const EXCERPTS = [
  {
    id: "signer",
    file: "src/signers/Signer.sol",
    code: `/// @dev For a Signer to be valid it has to be either
///      an EOA or a Passkey signer.
///      - Passkey -> slot2 has to be non empty.
struct Signer {
    bytes32 slot1;
    bytes32 slot2;
}`,
  },
  {
    id: "salt",
    file: "src/vault/SmartVaultFactory.sol",
    code: `/// @notice Returns the create2 salt
function _getSalt(
    address owner_,
    Signer[] calldata signers_,
    uint8 threshold_,
    uint256 salt_
) internal pure returns (bytes32) {
    return keccak256(
        abi.encode(owner_, signers_, threshold_, salt_)
    );
}`,
  },
  {
    id: "webauthn",
    file: "src/library/WebAuthn.sol",
    code: `/// @dev Attempts to use the RIP-7212 precompile
///      for signature verification. If precompile
///      verification fails, it falls back to
///      FreshCryptoLib.
address private constant _VERIFIER = address(0x100);`,
  },
] as const;

export function ContractReader() {
  const t = useTranslations("common.walletExplainer.contract");

  return (
    <div className="my-8 flex flex-col gap-6">
      {EXCERPTS.map((excerpt) => (
        <figure key={excerpt.id} className="m-0 grid gap-3 lg:grid-cols-[1fr_16rem] lg:gap-5">
          <div className="min-w-0 overflow-hidden rounded-md border border-border bg-muted/30">
            <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">{excerpt.file}</span>
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
                solidity
              </span>
            </div>
            <pre className="m-0 overflow-x-auto px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-foreground/90">
              <code>{excerpt.code}</code>
            </pre>
          </div>
          <figcaption className="flex items-start gap-2.5 lg:pt-1">
            <span className="mt-1.5 h-px w-5 shrink-0 bg-primary lg:mt-2" aria-hidden />
            <p className="m-0 text-[12.5px] leading-relaxed text-muted-foreground">{t(`${excerpt.id}Note`)}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
