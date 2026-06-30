import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
  LinkIcon,
  Music2Icon,
  PaperclipIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import { fetchTimelineAttachmentsByDid, type TimelineAttachmentItem } from "../../_lib/indexer";
import { formatDate } from "../../_lib/format";
import type { AccountRouteData } from "../_lib/account-route";

// Galleries are surfaced on their own tab, so keep this list to documents,
// datasets and other evidence files.
const HIDDEN_CONTENT_TYPES = new Set(["gallery"]);

type FriendlyType = "spreadsheet" | "pdf" | "document" | "presentation" | "image" | "video" | "audio" | "link" | "file";

type AttachmentLink = {
  href: string;
  friendlyType: FriendlyType;
  sizeLabel: string | null;
};

type AttachmentCardModel = {
  key: string;
  title: string;
  date: string;
  links: AttachmentLink[];
};

const TYPE_ICONS: Record<FriendlyType, LucideIcon> = {
  spreadsheet: FileSpreadsheetIcon,
  pdf: FileTextIcon,
  document: FileTextIcon,
  presentation: PresentationIcon,
  image: ImageIcon,
  video: FilmIcon,
  audio: Music2Icon,
  link: LinkIcon,
  file: FileIcon,
};

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

function friendlyTypeFor(mimeType: string | null, name: string): FriendlyType {
  const mime = (mimeType ?? "").toLowerCase();
  const ext = extensionOf(name);
  if (mime.includes("spreadsheet") || mime === "text/csv" || ["csv", "xls", "xlsx", "ods"].includes(ext)) {
    return "spreadsheet";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac"].includes(ext)) return "audio";
  if (["ppt", "pptx", "odp"].includes(ext)) return "presentation";
  if (["doc", "docx", "odt", "txt", "text", "md", "markdown", "rtf"].includes(ext)) return "document";
  return "file";
}

function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

type RawContentItem = {
  $type?: string;
  uri?: unknown;
  blob?: { uri?: unknown; mimeType?: unknown; size?: unknown } | null;
};

function parseLinks(content: unknown, title: string): AttachmentLink[] {
  if (!Array.isArray(content)) return [];
  const links: AttachmentLink[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawContentItem;
    if (item.$type === "org.hypercerts.defs#smallBlob" && item.blob && typeof item.blob === "object") {
      const blobUri = typeof item.blob.uri === "string" ? item.blob.uri : null;
      if (!blobUri) continue;
      links.push({
        href: blobUri,
        friendlyType: friendlyTypeFor(typeof item.blob.mimeType === "string" ? item.blob.mimeType : null, title),
        sizeLabel: formatBytes(typeof item.blob.size === "number" ? item.blob.size : null),
      });
      continue;
    }
    if (item.$type === "org.hypercerts.defs#uri" && typeof item.uri === "string" && isHttpUrl(item.uri)) {
      links.push({ href: item.uri, friendlyType: "link", sizeLabel: null });
    }
  }
  return links;
}

function toCardModel(item: TimelineAttachmentItem, fallbackTitle: string): AttachmentCardModel {
  const title = item.record.title?.trim() || fallbackTitle;
  return {
    key: item.metadata.uri ?? item.metadata.rkey ?? title,
    title,
    date: formatDate(item.record.createdAt ?? item.metadata.createdAt),
    links: parseLinks(item.record.content, title),
  };
}

export async function AccountAttachmentsTabContent({ account, did }: { account: AccountRouteData; did: string }) {
  const t = await getTranslations("common.accountAttachments");
  const attachments = await fetchTimelineAttachmentsByDid(did).catch(() => [] as TimelineAttachmentItem[]);
  const cards = attachments
    .filter((item) => !HIDDEN_CONTENT_TYPES.has((item.record.contentType ?? "").toLowerCase()))
    .map((item) => toCardModel(item, t("untitled")));

  const typeLabel = (type: FriendlyType): string => t(`types.${type}`);

  return (
    <section className="py-6">
      <div className="flex items-baseline gap-2">
        <h2 className="font-instrument text-2xl italic leading-none text-foreground">{t("title")}</h2>
        {cards.length > 0 ? <span className="text-sm text-muted-foreground">{cards.length}</span> : null}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>

      {cards.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <PaperclipIcon className="size-6" />
          </span>
          <p className="text-sm font-medium text-foreground">{t("empty")}</p>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const primary = card.links[0];
            const Icon = TYPE_ICONS[primary?.friendlyType ?? "file"];
            return (
              <li
                key={card.key}
                className="flex gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{card.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {primary ? <span>{typeLabel(primary.friendlyType)}</span> : <span>{typeLabel("file")}</span>}
                    {primary?.sizeLabel ? (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="tabular-nums">{primary.sizeLabel}</span>
                      </>
                    ) : null}
                    {card.date ? (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{card.date}</span>
                      </>
                    ) : null}
                  </p>
                  {card.links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {card.links.map((link, index) => (
                        <Link
                          key={`${card.key}-${index}`}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          <LinkIcon className="size-3.5" />
                          {link.friendlyType === "link" ? t("openLink") : t("openFile")}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
