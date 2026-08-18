"use client";

// Live experiment 2: derive a real wallet address, character by character.
//
// Every value on screen is computed in the reader's browser with the same
// math the SmartVaultFactory runs on Ethereum:
//
//   innerSalt = keccak256("gainforest:org-vault:v1:" + account id)
//   salt      = keccak256(abi.encode(owner, signers, threshold, innerSalt))
//   address   = keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:]
//
// FACTORY is the real mainnet SmartVaultFactory and INIT_CODE_HASH is the
// value its initCodeHash() returns on mainnet, so for a given signer set
// this widget prints exactly the address the factory would predict.
// (Verified against getAddress() on mainnet.)

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  concat,
  encodeAbiParameters,
  getAddress,
  keccak256,
  slice,
  stringToBytes,
} from "viem";
import { FingerprintIcon, PlusIcon, XIcon } from "lucide-react";
import { truncateHex, useWalletLab } from "./WalletLab";

const FACTORY = "0x8E6Af8Ed94E87B4402D0272C5D6b0D47F0483e7C" as const;
const INIT_CODE_HASH = "0xe8da772266cc87d3f12d3463bb718f7505a9967a61f9014f1795c0f9543dad2b" as const;
const OWNER = "0x0000000000000000000000000000000000000000" as const;
const THRESHOLD = 1;

// Stand-ins when the reader skipped growing their own key above.
const SAMPLE_SIGNER = {
  x: `0x${"1".repeat(64)}` as const,
  y: `0x${"2".repeat(64)}` as const,
};
const SECOND_SIGNER = {
  x: `0x${"3".repeat(64)}` as const,
  y: `0x${"4".repeat(64)}` as const,
};

function derive(accountId: string, signers: Array<{ x: `0x${string}`; y: `0x${string}` }>) {
  const innerSalt = keccak256(stringToBytes(`gainforest:org-vault:v1:${accountId}`));
  const encoded = encodeAbiParameters(
    [
      { type: "address" },
      { type: "tuple[]", components: [{ type: "bytes32" }, { type: "bytes32" }] },
      { type: "uint8" },
      { type: "uint256" },
    ],
    [OWNER, signers.map((s) => [s.x, s.y] as const), THRESHOLD, BigInt(innerSalt)],
  );
  const salt = keccak256(encoded);
  const address = getAddress(slice(keccak256(concat(["0xff", FACTORY, salt, INIT_CODE_HASH])), 12));
  return { innerSalt, salt, address };
}

export function AddressForge() {
  const t = useTranslations("common.walletExplainer.addressForge");
  const { labKey } = useWalletLab();
  const [name, setName] = useState("rio-claro");
  const [secondDevice, setSecondDevice] = useState(false);

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "rio-claro";
  const accountId = `did:web:${cleanName}.org`;

  const firstSigner = labKey ?? SAMPLE_SIGNER;
  const signers = secondDevice ? [firstSigner, SECOND_SIGNER] : [firstSigner];
  const { innerSalt, salt, address } = useMemo(
    () => derive(accountId, signers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, firstSigner.x, firstSigner.y, secondDevice],
  );

  return (
    <figure className="my-8 rounded-md border border-border bg-muted/20">
      <figcaption className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>{t("bench")}</span>
        <span className="hidden text-muted-foreground/60 normal-case tracking-normal sm:inline">{t("liveTag")}</span>
      </figcaption>

      <div className="flex flex-col gap-0 p-4 sm:p-6">
        {/* Ingredient 1: the account. The reader types, the math reruns. */}
        <PipelineRow index={1} label={t("stepAccount")}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-0 rounded-md border border-input bg-background font-mono text-[13px] focus-within:border-ring">
              <span className="pl-3 text-muted-foreground">did:web:</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                aria-label={t("nameAria")}
                className="w-28 bg-transparent py-1.5 text-foreground outline-none sm:w-36"
              />
              <span className="pr-3 text-muted-foreground">.org</span>
            </label>
            <span className="text-[11.5px] text-muted-foreground">{t("typeHint")}</span>
          </div>
          {/* Literal salt-scheme constant from lib/splits-vault/shared.ts, shown as code. */}
          <HexLine label={'keccak256("gainforest:org-vault:v1:" + id)'} value={innerSalt} />
        </PipelineRow>

        {/* Ingredient 2: the signer set. */}
        <PipelineRow index={2} label={t("stepSigners")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] ${labKey ? "border-primary/50 bg-primary/5 text-primary" : "border-border bg-background text-muted-foreground"}`}
              title={`${firstSigner.x} / ${firstSigner.y}`}
            >
              <FingerprintIcon className="h-3 w-3" />
              {labKey ? t("yourKey") : t("sampleKey")} · {truncateHex(firstSigner.x, 4)}
            </span>
            {secondDevice ? (
              <button
                type="button"
                onClick={() => setSecondDevice(false)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                <FingerprintIcon className="h-3 w-3" />
                {t("secondKey")} · {truncateHex(SECOND_SIGNER.x, 4)}
                <XIcon className="h-3 w-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSecondDevice(true)}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                <PlusIcon className="h-3 w-3" />
                {t("addSecond")}
              </button>
            )}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            owner 0x0000…0000 · {t("thresholdNote")}
          </div>
        </PipelineRow>

        {/* One hash over everything. */}
        <PipelineRow index={3} label={t("stepSalt")}>
          <HexLine label="keccak256(abi.encode(…))" value={salt} />
        </PipelineRow>

        {/* CREATE2 → the address. */}
        <PipelineRow index={4} label={t("stepAddress")} last>
          <div className="font-mono text-[11px] text-muted-foreground">
            keccak256(0xff · {truncateHex(FACTORY, 4)} · salt · initCodeHash)[12:]
          </div>
          <motion.div
            key={address}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="mt-1.5 inline-block rounded-md border border-primary/50 bg-primary/5 px-3 py-1.5 font-mono text-[13px] font-medium tracking-tight text-primary sm:text-[15px]"
          >
            {address}
          </motion.div>
        </PipelineRow>

        <p className="m-0 mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground/70">
          {t("footnote")}
        </p>
      </div>
    </figure>
  );
}

function PipelineRow({
  index,
  label,
  last = false,
  children,
}: {
  index: number;
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] text-muted-foreground">
          {index}
        </span>
        {!last && <span className="w-px flex-1 bg-border" aria-hidden />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-5"}`}>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
        {children}
      </div>
    </div>
  );
}

function HexLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1.5 flex min-w-0 items-baseline gap-2 font-mono text-[11.5px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <motion.span key={value} initial={{ opacity: 0.35 }} animate={{ opacity: 1 }} className="truncate text-foreground" title={value}>
        {truncateHex(value, 8)}
      </motion.span>
    </div>
  );
}
