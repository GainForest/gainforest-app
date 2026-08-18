"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  Link2OffIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  StrikethroughIcon,
  TextQuoteIcon,
  UnderlineIcon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  leafletDocumentFromEditorRoot,
  leafletDocumentPlaintext,
  sanitizedEditorHtmlFromClipboard,
  type LeafletLinearDocument,
} from "@/app/_lib/leaflet-richtext";

export type RichTextValue = {
  /** Leaflet linear document, or null while the editor is empty. */
  document: LeafletLinearDocument | null;
  /** Newline-joined plain text of the document. Empty string when empty. */
  plaintext: string;
};

export const EMPTY_RICH_TEXT_VALUE: RichTextValue = { document: null, plaintext: "" };

export type RichTextEditorLabels = {
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  heading: string;
  subheading: string;
  quote: string;
  bulletedList: string;
  numberedList: string;
  addLink: string;
  removeLink: string;
  linkUrlPlaceholder: string;
  applyLink: string;
  cancelLink: string;
};

type BlockFormat = "p" | "h1" | "h2" | "blockquote";

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  link: boolean;
  block: BlockFormat;
};

const INACTIVE_TOOLBAR_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  unorderedList: false,
  orderedList: false,
  link: false,
  block: "p",
};

function exec(command: string, value?: string): void {
  try {
    document.execCommand(command, false, value);
  } catch {
    // execCommand can throw on unsupported commands; formatting simply no-ops.
  }
}

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function currentBlockFormat(): BlockFormat {
  try {
    const value = document.queryCommandValue("formatBlock").toLowerCase();
    if (value === "h1" || value === "h2" || value === "blockquote") return value;
  } catch {
    // Fall through to paragraph.
  }
  return "p";
}

function normalizeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * WYSIWYG editor that emits `pub.leaflet.pages.linearDocument` values, so
 * everything written here is interoperable with Leaflet's lexicons. Marks
 * (bold, italic, underline, strikethrough, links) become richtext facets;
 * headings, quotes, and lists become their Leaflet block types.
 *
 * Uncontrolled: the DOM owns the draft, `onChange` reports the serialized
 * value. Remount (change `key`) to clear it.
 */
export function RichTextEditor({
  labels,
  placeholder,
  disabled = false,
  onChange,
  className,
  contentClassName,
  "aria-label": ariaLabel,
}: {
  labels: RichTextEditorLabels;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: RichTextValue) => void;
  className?: string;
  contentClassName?: string;
  "aria-label"?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [toolbar, setToolbar] = useState<ToolbarState>(INACTIVE_TOOLBAR_STATE);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

  const emitChange = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const document = leafletDocumentFromEditorRoot(root);
    const plaintext = leafletDocumentPlaintext(document);
    setIsEmpty(plaintext.length === 0);
    onChange(document ? { document, plaintext } : EMPTY_RICH_TEXT_VALUE);
  }, [onChange]);

  const refreshToolbar = useCallback(() => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || !root.contains(selection.anchorNode)) {
      setToolbar(INACTIVE_TOOLBAR_STATE);
      return;
    }
    setToolbar({
      bold: queryState("bold"),
      italic: queryState("italic"),
      underline: queryState("underline"),
      strikethrough: queryState("strikeThrough"),
      unorderedList: queryState("insertUnorderedList"),
      orderedList: queryState("insertOrderedList"),
      link: linkTargetFromSelection() !== null,
      block: currentBlockFormat(),
    });
  }, []);

  useEffect(() => {
    // New paragraphs should be <p>, and formatting should use tags rather
    // than inline styles, so the serializer sees semantic markup.
    exec("defaultParagraphSeparator", "p");
    exec("styleWithCSS", "false");
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => refreshToolbar();
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [refreshToolbar]);

  function linkTargetFromSelection(): HTMLAnchorElement | null {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return null;
    let node: Node | null = selection.anchorNode;
    while (node && node !== root) {
      if (node instanceof HTMLAnchorElement) return node;
      node = node.parentNode;
    }
    return null;
  }

  function focusEditor(): void {
    rootRef.current?.focus();
  }

  function applyAndSync(action: () => void): void {
    if (disabled) return;
    focusEditor();
    action();
    emitChange();
    refreshToolbar();
  }

  function toggleBlock(format: Exclude<BlockFormat, "p">): void {
    applyAndSync(() => {
      exec("formatBlock", currentBlockFormat() === format ? "<p>" : `<${format}>`);
    });
  }

  function saveSelection(): void {
    const selection = window.getSelection();
    savedRangeRef.current =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
  }

  function restoreSelection(): void {
    const range = savedRangeRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function handleLinkButton(): void {
    if (disabled) return;
    const anchor = linkTargetFromSelection();
    if (anchor) {
      applyAndSync(() => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(anchor);
        selection?.removeAllRanges();
        selection?.addRange(range);
        exec("unlink");
      });
      return;
    }
    saveSelection();
    setLinkDraft("");
  }

  function applyLink(rawUrl: string): void {
    const url = normalizeLinkUrl(rawUrl);
    setLinkDraft(null);
    if (!url) return;
    applyAndSync(() => {
      restoreSelection();
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        exec("insertHTML", `<a href="${url}">${url}</a>`);
      } else {
        exec("createLink", url);
      }
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    if (!html && !text) return;
    event.preventDefault();

    const sanitized = html ? sanitizedEditorHtmlFromClipboard(html) : null;
    if (sanitized) {
      exec("insertHTML", sanitized);
    } else if (text) {
      exec("insertText", text);
    }
    emitChange();
    refreshToolbar();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "k") {
      event.preventDefault();
      handleLinkButton();
    }
    if (key === "b" || key === "i" || key === "u") {
      // Native contentEditable shortcuts; just make sure we re-serialize.
      requestAnimationFrame(() => {
        emitChange();
        refreshToolbar();
      });
    }
  }

  function toolbarButton(
    label: string,
    Icon: LucideIcon,
    active: boolean,
    onActivate: () => void,
  ): ReactNode {
    return (
      <Tooltip key={label}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon-sm"
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onActivate}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <TooltipProvider delayDuration={150}>
        <div
          role="toolbar"
          aria-label={ariaLabel}
          className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-2 py-1.5"
        >
          {toolbarButton(labels.bold, BoldIcon, toolbar.bold, () => applyAndSync(() => exec("bold")))}
          {toolbarButton(labels.italic, ItalicIcon, toolbar.italic, () =>
            applyAndSync(() => exec("italic")),
          )}
          {toolbarButton(labels.underline, UnderlineIcon, toolbar.underline, () =>
            applyAndSync(() => exec("underline")),
          )}
          {toolbarButton(labels.strikethrough, StrikethroughIcon, toolbar.strikethrough, () =>
            applyAndSync(() => exec("strikeThrough")),
          )}
          <span aria-hidden className="mx-1 h-4 w-px bg-border/70" />
          {toolbarButton(labels.heading, Heading1Icon, toolbar.block === "h1", () => toggleBlock("h1"))}
          {toolbarButton(labels.subheading, Heading2Icon, toolbar.block === "h2", () =>
            toggleBlock("h2"),
          )}
          {toolbarButton(labels.quote, TextQuoteIcon, toolbar.block === "blockquote", () =>
            toggleBlock("blockquote"),
          )}
          <span aria-hidden className="mx-1 h-4 w-px bg-border/70" />
          {toolbarButton(labels.bulletedList, ListIcon, toolbar.unorderedList, () =>
            applyAndSync(() => exec("insertUnorderedList")),
          )}
          {toolbarButton(labels.numberedList, ListOrderedIcon, toolbar.orderedList, () =>
            applyAndSync(() => exec("insertOrderedList")),
          )}
          <span aria-hidden className="mx-1 h-4 w-px bg-border/70" />
          {toolbarButton(
            toolbar.link ? labels.removeLink : labels.addLink,
            toolbar.link ? Link2OffIcon : LinkIcon,
            toolbar.link,
            handleLinkButton,
          )}
        </div>
      </TooltipProvider>

      {linkDraft !== null ? (
        <form
          className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2 py-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink(linkDraft);
          }}
        >
          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder={labels.linkUrlPlaceholder}
            aria-label={labels.addLink}
            className="h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setLinkDraft(null);
                focusEditor();
              }
            }}
          />
          <Button type="submit" size="sm" variant="secondary" className="h-7">
            {labels.applyLink}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setLinkDraft(null);
              focusEditor();
            }}
          >
            {labels.cancelLink}
          </Button>
        </form>
      ) : null}

      <div className="relative">
        {isEmpty && placeholder ? (
          <p
            aria-hidden
            className="pointer-events-none absolute left-3 top-2 text-base text-muted-foreground md:text-sm"
          >
            {placeholder}
          </p>
        ) : null}
        <div
          ref={rootRef}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          onInput={() => {
            emitChange();
          }}
          onBlur={emitChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className={cn(
            "min-h-28 w-full px-3 py-2 text-base outline-none md:text-sm",
            "[&_p]:my-0 [&_p+p]:mt-2",
            "[&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold first:[&_h1]:mt-0",
            "[&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold first:[&_h2]:mt-0",
            "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold first:[&_h3]:mt-0",
            "[&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-foreground/70",
            "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
            "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/30 [&_a]:underline-offset-2",
            "[&_code]:rounded [&_code]:bg-foreground/[0.07] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
            disabled && "cursor-not-allowed opacity-50",
            contentClassName,
          )}
        />
      </div>
    </div>
  );
}
