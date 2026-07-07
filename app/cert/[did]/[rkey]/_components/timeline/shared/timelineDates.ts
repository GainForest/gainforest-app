
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthYear(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

export function formatDateRangeFromValues(
  values: Array<string | null | undefined>,
  locale = "en-US",
): string | null {
  const dates = values.map(parseDate).filter((date): date is Date => date !== null);
  if (dates.length === 0) return null;

  const first = dates.reduce((current, next) =>
    next.getTime() < current.getTime() ? next : current,
  );
  const last = dates.reduce((current, next) =>
    next.getTime() > current.getTime() ? next : current,
  );

  if (
    first.getUTCFullYear() === last.getUTCFullYear() &&
    first.getUTCMonth() === last.getUTCMonth()
  ) {
    return formatMonthYear(first, locale);
  }

  return `${formatMonthYear(first, locale)} – ${formatMonthYear(last, locale)}`;
}
