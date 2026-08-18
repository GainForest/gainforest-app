export const TREE_FUTURE_DATE_ERROR = "Date cannot be in the future. Use today or an earlier date.";

type CalendarDateParts = {
  year: number;
  month?: number;
  day?: number;
};

const YEAR_ONLY_PATTERN = /^(\d{4})$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}/;

function toNumber(value: string): number {
  return Number.parseInt(value, 10);
}

function todayParts(referenceDate: Date): Required<CalendarDateParts> {
  return {
    year: referenceDate.getFullYear(),
    month: referenceDate.getMonth() + 1,
    day: referenceDate.getDate(),
  };
}

function parseTreeDateParts(value: string): CalendarDateParts | null {
  const trimmed = value.trim();

  const yearOnlyMatch = trimmed.match(YEAR_ONLY_PATTERN);
  if (yearOnlyMatch) {
    return { year: toNumber(yearOnlyMatch[1]) };
  }

  const dateOnlyMatch = trimmed.match(DATE_ONLY_PATTERN) ?? trimmed.match(ISO_TIMESTAMP_PATTERN);
  if (dateOnlyMatch) {
    return {
      year: toNumber(dateOnlyMatch[1]),
      month: toNumber(dateOnlyMatch[2]),
      day: toNumber(dateOnlyMatch[3]),
    };
  }

  const usDateMatch = trimmed.match(US_DATE_PATTERN);
  if (usDateMatch) {
    return {
      year: toNumber(usDateMatch[3]),
      month: toNumber(usDateMatch[1]),
      day: toNumber(usDateMatch[2]),
    };
  }

  return null;
}

function compareDateOnly(left: Required<CalendarDateParts>, right: Required<CalendarDateParts>): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

export function isTreeDateInFuture(value: string, referenceDate = new Date()): boolean {
  const parsed = parseTreeDateParts(value);
  if (!parsed) return false;

  const today = todayParts(referenceDate);
  if (parsed.month === undefined || parsed.day === undefined) {
    return parsed.year > today.year;
  }

  return compareDateOnly({ year: parsed.year, month: parsed.month, day: parsed.day }, today) > 0;
}

export function getTreeFutureDateError(value: string, referenceDate = new Date()): string | null {
  return isTreeDateInFuture(value, referenceDate) ? TREE_FUTURE_DATE_ERROR : null;
}
