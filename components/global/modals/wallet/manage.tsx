"use client";

/**
 * ManageWalletsModal — lists all linked wallets.
 *
 * Per-wallet actions:
 *   ✏️  Pencil → opens AddWalletModal (pre-fills label; user can re-link the
 *               wallet and/or change the label before signing again)
 *   🗑️  Trash  → opens DeleteWalletModal to confirm removal
 */

import { useState } from "react";

import { useModal } from "@/components/ui/modal/context";
import {
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { Button } from "@/components/ui/button";
import { FACILITATOR_WALLET_ADDRESS } from "@/app/_lib/urls";
import { isWalletTrusted, type EvmLink } from "@/app/_lib/funding";
import { AddWalletModal } from "./add";
import { DeleteWalletModal } from "./delete";
import { MODAL_IDS } from "@/components/global/modals/ids";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAddress(address: string | null | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isWalletValid(
  link: EvmLink,
  facilitatorAddress: string | undefined,
): boolean {
  const valid = link.specialMetadata?.valid === true;
  if (!valid) return false;
  return isWalletTrusted(link, facilitatorAddress);
}

// ── Row ───────────────────────────────────────────────────────────────────────

function WalletRow({
  link,
  facilitatorAddress,
  onEdit,
  onDelete,
}: {
  link: EvmLink;
  facilitatorAddress: string | undefined;
  onEdit: (link: EvmLink) => void;
  onDelete: (link: EvmLink) => void;
}) {
  const address = link.record?.address ?? "";
  const valid = isWalletValid(link, facilitatorAddress);
  const hasLabel = !!link.record?.name;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="shrink-0">
        {valid ? (
          <CheckCircle2Icon className="size-4 text-primary" />
        ) : (
          <AlertTriangleIcon className="size-4 text-destructive" />
        )}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-mono text-foreground leading-tight">
          {formatAddress(address)}
        </span>
        <span
          className={`text-xs leading-tight ${hasLabel ? "text-muted-foreground" : "text-muted-foreground/50 italic"}`}
        >
          {hasLabel ? link.record?.name : "No label"}
          {!valid && (
            <span className="text-destructive ml-1">· Unverified</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => onEdit(link)}
          title="Edit / re-link"
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(link)}
          title="Remove"
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ManageWalletsModalProps {
  ownerDid: string;
  evmLinks: EvmLink[];
  onBack: () => void | Promise<void>;
  onChanged: () => void;
}

export function ManageWalletsModal({
  ownerDid,
  evmLinks: initialLinks,
  onBack,
  onChanged,
}: ManageWalletsModalProps) {
  const { pushModal, popModal, stack, hide } = useModal();
  const facilitatorAddress = FACILITATOR_WALLET_ADDRESS;

  const [links, setLinks] = useState<EvmLink[]>(initialLinks);

  const handleBack = () => {
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      onBack();
    }
  };

  const invalidate = () => {
    onChanged();
  };

  const handleEdit = (link: EvmLink) => {
    pushModal({
      id: MODAL_IDS.WALLET_ADD,
      content: (
        <AddWalletModal
          did={ownerDid}
          existingRkey={link.metadata?.rkey ?? undefined}
          existingName={link.record?.name ?? undefined}
          onBack={() => popModal()}
          onSuccess={() => {
            invalidate();
            popModal();
          }}
        />
      ),
    });
  };

  const handleDelete = (link: EvmLink) => {
    pushModal({
      id: MODAL_IDS.WALLET_DELETE,
      content: (
        <DeleteWalletModal
          rkey={link.metadata?.rkey ?? ""}
          address={link.record?.address ?? ""}
          name={link.record?.name}
          onBack={() => popModal()}
          onDeleted={() => {
            setLinks((prev) =>
              prev.filter((l) => l.metadata?.rkey !== link.metadata?.rkey),
            );
            invalidate();
            popModal();
          }}
        />
      ),
    });
  };

  return (
    <ModalContent dismissible={false}>
      <ModalHeader backAction={handleBack}>
        <ModalTitle>Linked Wallets</ModalTitle>
        <ModalDescription>Manage your linked wallets</ModalDescription>
      </ModalHeader>

      <div className="pt-1">
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No linked wallets.
          </p>
        ) : (
          <div>
            {links.map((link) => (
              <WalletRow
                key={link.metadata?.rkey ?? link.metadata?.uri}
                link={link}
                facilitatorAddress={facilitatorAddress}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </ModalContent>
  );
}
