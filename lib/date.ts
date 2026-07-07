type ParsedDateState = "empty" | "valid" | "invalid";

type ParsedDateResult = {
  state: ParsedDateState;
  date: Date | null;
};

/**
 * Parses a date string that can be either:
 * - date-only (YYYY-MM-DD)
 * - ISO datetime (e.g. 2024-01-01T00:00:00Z)
 *
 * Returns an explicit state so callers can distinguish empty vs invalid values.
 */
export function parseOrganizationDate(value: string | null): ParsedDateResult {
  if (!value) {
    return { state: "empty", date: null };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { state: "empty", date: null };
  }

  // Keep date-only values timezone-stable.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const isUtcIsoDateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(trimmed);

  if (!isDateOnly && !isUtcIsoDateTime) {
    return { state: "invalid", date: null };
  }

  const parsedDate = new Date(isDateOnly ? `${trimmed}T00:00:00Z` : trimmed);

  if (Number.isNaN(parsedDate.getTime())) {
    return { state: "invalid", date: null };
  }

  if (isDateOnly) {
    const normalizedDateOnly = parsedDate.toISOString().slice(0, 10);
    if (normalizedDateOnly !== trimmed) {
      return { state: "invalid", date: null };
    }

    return { state: "valid", date: parsedDate };
  }

  if (isUtcIsoDateTime) {
    const normalizedInput = trimmed.replace(/\.\d{1,3}Z$/, "Z");
    const normalizedParsed = parsedDate
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    if (normalizedInput !== normalizedParsed) {
      return { state: "invalid", date: null };
    }
  }

  return { state: "valid", date: parsedDate };
}
