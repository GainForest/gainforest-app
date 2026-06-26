export type TimelineDocumentFormat =
  | "pdf"
  | "text"
  | "markdown"
  | "html"
  | "rtf"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "document";

type TimelineDocumentFormatConfig = {
  fallbackMimeType: string;
  defaultExtension: string | null;
  extensions: readonly string[];
  mimeTypes?: readonly string[];
  mimePrefixes?: readonly string[];
  matchesMime?: (mimeType: string) => boolean;
};

const TIMELINE_DOCUMENT_FORMATS: Record<
  TimelineDocumentFormat,
  TimelineDocumentFormatConfig
> = {
  pdf: {
    fallbackMimeType: "application/pdf",
    defaultExtension: "pdf",
    extensions: ["pdf"],
    matchesMime: (mimeType) => mimeType.includes("pdf"),
  },
  text: {
    fallbackMimeType: "text/plain",
    defaultExtension: "txt",
    extensions: ["txt", "text"],
    mimePrefixes: ["text/plain"],
  },
  markdown: {
    fallbackMimeType: "text/markdown",
    defaultExtension: "md",
    extensions: ["md", "markdown"],
    mimePrefixes: ["text/markdown", "text/x-markdown", "application/markdown"],
  },
  html: {
    fallbackMimeType: "text/html",
    defaultExtension: "html",
    extensions: ["html", "htm"],
    mimeTypes: ["application/xhtml+xml"],
    mimePrefixes: ["text/html"],
  },
  rtf: {
    fallbackMimeType: "application/rtf",
    defaultExtension: "rtf",
    extensions: ["rtf"],
    mimePrefixes: ["application/rtf", "text/rtf", "application/x-rtf"],
  },
  word: {
    fallbackMimeType: "application/msword",
    defaultExtension: "docx",
    extensions: ["doc", "docx", "odt"],
    mimeTypes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
    ],
  },
  spreadsheet: {
    fallbackMimeType: "text/plain",
    defaultExtension: "xlsx",
    extensions: ["csv", "xls", "xlsx", "ods"],
    mimeTypes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet",
    ],
    mimePrefixes: ["text/csv"],
  },
  presentation: {
    fallbackMimeType: "application/vnd.ms-powerpoint",
    defaultExtension: "pptx",
    extensions: ["ppt", "pptx", "odp"],
    mimeTypes: [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.presentation",
    ],
  },
  document: {
    fallbackMimeType: "application/octet-stream",
    defaultExtension: null,
    extensions: [],
  },
};

const DETECTABLE_FORMATS: TimelineDocumentFormat[] = [
  "pdf",
  "text",
  "markdown",
  "html",
  "rtf",
  "word",
  "spreadsheet",
  "presentation",
];

function normalizeMimeType(mimeType: string | null | undefined): string {
  return mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mimeMatches(format: TimelineDocumentFormat, mimeType: string | null | undefined): boolean {
  const config = TIMELINE_DOCUMENT_FORMATS[format];
  const normalizedMime = normalizeMimeType(mimeType);

  return Boolean(
    normalizedMime &&
      (config.matchesMime?.(normalizedMime) ||
        config.mimeTypes?.includes(normalizedMime) ||
        config.mimePrefixes?.some((prefix) => normalizedMime.startsWith(prefix))),
  );
}

function extensionMatches(format: TimelineDocumentFormat, extension: string | null | undefined): boolean {
  const normalizedExtension = extension?.toLowerCase() ?? null;
  return Boolean(
    normalizedExtension && TIMELINE_DOCUMENT_FORMATS[format].extensions.includes(normalizedExtension),
  );
}

export function getTimelineDocumentFormat(
  mimeType: string | null | undefined,
  extension: string | null | undefined,
): TimelineDocumentFormat | null {
  for (const format of DETECTABLE_FORMATS) {
    if (mimeMatches(format, mimeType) || extensionMatches(format, extension)) {
      return format;
    }
  }

  return null;
}

export function getTimelineDocumentFallbackMimeType(format: TimelineDocumentFormat): string {
  return TIMELINE_DOCUMENT_FORMATS[format].fallbackMimeType;
}

export function getTimelineDocumentDefaultExtension(
  format: TimelineDocumentFormat,
): string | null {
  return TIMELINE_DOCUMENT_FORMATS[format].defaultExtension;
}

export function getTimelineDocumentFormatExtensions(format: TimelineDocumentFormat): string[] {
  return [...TIMELINE_DOCUMENT_FORMATS[format].extensions];
}

export function isTimelineDocumentFormat(format: string | null | undefined): format is TimelineDocumentFormat {
  return Boolean(format && format in TIMELINE_DOCUMENT_FORMATS);
}
