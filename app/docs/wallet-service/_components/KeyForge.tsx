"use client";

// Live experiment 1: grow a real P-256 key in the reader's browser.
//
// This is not an illustration. The button asks WebCrypto for a fresh
// ECDSA key on secp256r1 — the exact curve passkeys use — with the
// private half marked non-extractable, then signs a sample payment hash
// and verifies the signature, all locally. No passkey is saved to the
// reader's device and nothing leaves the page.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { keccak256, stringToBytes } from "viem";
import { CheckCircle2Icon, CpuIcon, LockKeyholeIcon, PenLineIcon, SparklesIcon } from "lucide-react";
import { rawPointToSlots, truncateHex, useWalletLab, type LabKey } from "./WalletLab";

type Signature = { r: `0x${string}`; s: `0x${string}`; valid: boolean };

function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export function KeyForge() {
  const t = useTranslations("common.walletExplainer.keyForge");
  const { labKey, setLabKey } = useWalletLab();
  // The sample payment is real signed data: its keccak256 hash is what the
  // key signs below, so the reader sees the full journey message → hash →
  // signature in their own language.
  const sampleMessage = t("sampleMessage");
  const sampleHash = useMemo(() => keccak256(stringToBytes(sampleMessage)), [sampleMessage]);
  const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const growKey = async () => {
    setBusy(true);
    setSignature(null);
    try {
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false, // the private key is non-extractable: even this page cannot read it
        ["sign", "verify"],
      );
      const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
      const slots = rawPointToSlots(raw);
      if (!slots) throw new Error("unexpected key format");
      setKeyPair(pair);
      setLabKey(slots);
    } catch {
      setUnsupported(true);
    } finally {
      setBusy(false);
    }
  };

  const signSample = async () => {
    if (!keyPair) return;
    setBusy(true);
    try {
      const hashBytes = Uint8Array.from(sampleHash.slice(2).match(/.{2}/g)!.map((b) => parseInt(b, 16)));
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, hashBytes);
      const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keyPair.publicKey, sig, hashBytes);
      const bytes = new Uint8Array(sig);
      setSignature({ r: toHex(bytes.slice(0, 32)), s: toHex(bytes.slice(32, 64)), valid });
    } catch {
      setUnsupported(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <figure className="my-8 rounded-md border border-border bg-muted/20">
      <figcaption className="flex items-center gap-2 border-b border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <SparklesIcon className="h-3.5 w-3.5 text-primary" />
        {t("bench")}
      </figcaption>

      <div className="p-4 sm:p-6">
        {!labKey ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="m-0 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">{t("invite")}</p>
            <button
              type="button"
              onClick={() => void growKey()}
              disabled={busy || unsupported}
              className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {t("growButton")}
            </button>
            {unsupported && <p className="m-0 text-[12px] text-destructive">{t("unsupported")}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* The secure-chip side: the half that never leaves. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-dashed border-border bg-background px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <LockKeyholeIcon className="h-3 w-3" />
                  {t("privateLabel")}
                </div>
                <div className="font-mono text-[13px] text-muted-foreground/50 select-none" aria-hidden>
                  ████████████████████
                </div>
                <p className="m-0 mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{t("privateNote")}</p>
              </div>

              <div className="rounded-md border border-primary/40 bg-primary/5 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
                  <CpuIcon className="h-3 w-3" />
                  {t("publicLabel")}
                </div>
                <SlotRow name="slot1" value={labKey.x} />
                <SlotRow name="slot2" value={labKey.y} />
                <p className="m-0 mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{t("publicNote")}</p>
              </div>
            </div>

            {/* Sign + verify a sample payment, like an approval would. */}
            <div className="rounded-md border border-border bg-background px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {t("messageLabel")}
                  </div>
                  <div className="mt-0.5 font-mono text-[12.5px] text-foreground">“{sampleMessage}”</div>
                  <div className="font-mono text-[11px] text-muted-foreground" title={sampleHash}>
                    keccak256 → {truncateHex(sampleHash, 8)}
                  </div>
                </div>
                {keyPair && !signature && (
                  <button
                    type="button"
                    onClick={() => void signSample()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-background px-3 py-1.5 text-[12.5px] font-medium text-primary disabled:opacity-50"
                  >
                    <PenLineIcon className="h-3.5 w-3.5" />
                    {t("signButton")}
                  </button>
                )}
              </div>

              <AnimatePresence>
                {signature && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 border-t border-border pt-3">
                      <SlotRow name="r" value={signature.r} />
                      <SlotRow name="s" value={signature.s} />
                      <div
                        className={`mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${signature.valid ? "text-primary" : "text-destructive"}`}
                      >
                        <CheckCircle2Icon className="h-3.5 w-3.5" />
                        {signature.valid ? t("verified") : t("failed")}
                      </div>
                      <p className="m-0 mt-1.5 text-[11.5px] leading-snug text-muted-foreground">{t("verifyNote")}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p className="m-0 text-center text-[11px] text-muted-foreground/70">{t("privacyNote")}</p>
          </div>
        )}
      </div>
    </figure>
  );
}

function SlotRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-[12px]">
      <span className="w-10 shrink-0 text-muted-foreground">{name}</span>
      <span className="truncate text-foreground" title={value}>
        {truncateHex(value, 10)}
      </span>
    </div>
  );
}

export type { LabKey };
