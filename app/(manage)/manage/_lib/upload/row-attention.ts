import type {
  RowError,
  TreeUploadRowAttentionKind,
  TreeUploadRowAttentionSummary,
  ValidatedRow,
} from "./types";

const FALLBACK_ROW_ISSUE_MESSAGE = "This row needs review.";

function normalizeRowMessages(messages: readonly string[]): string[] {
  const normalized = messages.map((m) => m.trim()).filter((m) => m.length > 0);
  return normalized.length > 0 ? normalized : [FALLBACK_ROW_ISSUE_MESSAGE];
}

export function getValidatedRowLabel(row: ValidatedRow): string {
  return row.occurrence.scientificName || `Row ${row.index + 1}`;
}

export function getTreeUploadRowAttentionKindLabel(kind: TreeUploadRowAttentionKind): string {
  switch (kind) {
    case "failed": return "Failed";
    case "partial": return "Needs follow-up";
    case "skipped": return "Skipped";
  }
}

export function createTreeUploadRowAttentionSummary(options: {
  sourceRowIndex: number;
  rowLabel: string;
  messages: string[];
  kind: TreeUploadRowAttentionKind;
}): TreeUploadRowAttentionSummary {
  return {
    sourceRowIndex: options.sourceRowIndex,
    rowLabel: options.rowLabel,
    messages: normalizeRowMessages(options.messages),
    kind: options.kind,
  };
}

export function buildPreviewRowAttentionSummaries(
  errors: RowError[],
  mappedRows: Record<string, string>[],
): TreeUploadRowAttentionSummary[] {
  return errors.map((err) => {
    const row = mappedRows[err.index];
    const rowLabel = (row?.["scientificName"] ?? `Row ${err.index + 1}`).trim() || `Row ${err.index + 1}`;
    const messages = err.issues.map((issue) => `${issue.path}: ${issue.message}`);
    return createTreeUploadRowAttentionSummary({
      sourceRowIndex: err.index,
      rowLabel,
      messages,
      kind: "skipped",
    });
  });
}
