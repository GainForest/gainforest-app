export type SpeciesSuggestion = {
  scientificName: string;
  vernacularName: string | null;
  note: string | null;
};

type SpeciesSuggestionLabels = {
  suggestion: string;
  commonName: string;
  note: string;
};

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Identification proposals are regular observation comments. The leading
 * icons make them recognizable without exposing an implementation marker and
 * let every locale use translated field labels.
 */
export function formatSpeciesSuggestion(
  suggestion: SpeciesSuggestion,
  labels: SpeciesSuggestionLabels,
): string {
  const lines = [
    `🔬 ${oneLine(labels.suggestion)}: ${oneLine(suggestion.scientificName)}`,
  ];
  if (suggestion.vernacularName) {
    lines.push(`🌿 ${oneLine(labels.commonName)}: ${oneLine(suggestion.vernacularName)}`);
  }
  if (suggestion.note) lines.push(`💬 ${oneLine(labels.note)}: ${oneLine(suggestion.note)}`);
  return lines.join("\n");
}

function valueAfterLabel(line: string): string | null {
  const separator = line.indexOf(":");
  if (separator < 0) return null;
  return line.slice(separator + 1).trim() || null;
}

/** Parse a structured identification comment regardless of the writer's UI locale. */
export function parseSpeciesSuggestion(text: string | null | undefined): SpeciesSuggestion | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines[0]?.startsWith("🔬 ")) return null;
  const scientificName = valueAfterLabel(lines[0]);
  if (!scientificName) return null;
  return {
    scientificName,
    vernacularName: valueAfterLabel(lines.find((line) => line.startsWith("🌿 ")) ?? ""),
    note: valueAfterLabel(lines.find((line) => line.startsWith("💬 ")) ?? ""),
  };
}
