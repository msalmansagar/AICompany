// ─────────────────────────────────────────────────────────────
// Relative date references for validation bounds.
//
// A maker wants "not before today" or "no later than ten years from this month". A fixed
// date in the rule would be wrong tomorrow, so the bound is a compact token stored where a
// field schema name would otherwise go, prefixed so it can never be mistaken for one:
//
//   @today            the current calendar day
//   @monthStart       the first day of the current month
//   @monthEnd         the last day of the current month
//   @today+10y        an offset in days (d), months (m) or years (y)
//   @monthEnd-1m
//
// Resolution yields a local YYYY-MM-DD string, the same shape a date field holds.
// ─────────────────────────────────────────────────────────────

export const RELATIVE_DATE_PREFIX = '@';

export type RelativeDateAnchor = 'today' | 'monthStart' | 'monthEnd';
export type RelativeDateUnit = 'd' | 'm' | 'y';

export interface RelativeDateRef {
  anchor: RelativeDateAnchor;
  offset: number;
  unit: RelativeDateUnit;
}

export const RELATIVE_DATE_ANCHORS: readonly RelativeDateAnchor[] = ['today', 'monthStart', 'monthEnd'];
export const RELATIVE_DATE_UNITS: readonly RelativeDateUnit[] = ['d', 'm', 'y'];

const REF_PATTERN = /^@(today|monthStart|monthEnd)(?:([+-]\d{1,3})([dmy]))?$/;

/** Whether a cross-field target names a relative date rather than another field. */
export function isRelativeDateRef(ref: unknown): ref is string {
  return typeof ref === 'string' && ref.startsWith(RELATIVE_DATE_PREFIX);
}

/** The parts of a reference, or null when the token is not one this module defines. */
export function parseRelativeDateRef(ref: string): RelativeDateRef | null {
  const match = REF_PATTERN.exec(ref);
  if (!match) return null;
  const anchor = match[1] as RelativeDateAnchor;
  const offset = match[2] === undefined ? 0 : Number(match[2]);
  const unit = (match[3] ?? 'd') as RelativeDateUnit;
  return { anchor, offset, unit };
}

/** The canonical token for a reference; a zero offset carries no suffix. */
export function formatRelativeDateRef(ref: RelativeDateRef): string {
  if (ref.offset === 0) return `${RELATIVE_DATE_PREFIX}${ref.anchor}`;
  const sign = ref.offset > 0 ? '+' : '-';
  return `${RELATIVE_DATE_PREFIX}${ref.anchor}${sign}${Math.abs(ref.offset)}${ref.unit}`;
}

/**
 * The calendar day a reference names, as local YYYY-MM-DD, or null for an unknown token.
 * Month and year offsets keep the anchor's meaning: the end of the month ten years out is
 * still the LAST day of that month, and 31 January plus one month is 28 (or 29) February.
 */
export function resolveRelativeDate(ref: string, now: Date = new Date()): string | null {
  const parsed = parseRelativeDateRef(ref);
  if (!parsed) return null;
  return formatLocalDate(shiftAnchor(parsed, now));
}

function shiftAnchor(ref: RelativeDateRef, now: Date): Date {
  if (ref.unit === 'd') return addDays(anchorDate(ref.anchor, now), ref.offset);

  const monthsToAdd = ref.unit === 'y' ? ref.offset * 12 : ref.offset;
  const shiftedMonth = new Date(now.getFullYear(), now.getMonth() + monthsToAdd, 1);
  return anchorDate(ref.anchor, shiftedMonth, now.getDate());
}

function anchorDate(anchor: RelativeDateAnchor, month: Date, dayOfMonth: number = month.getDate()): Date {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  switch (anchor) {
    case 'monthStart':
      return new Date(year, monthIndex, 1);
    case 'monthEnd':
      return new Date(year, monthIndex + 1, 0);
    default:
      return new Date(year, monthIndex, Math.min(dayOfMonth, daysInMonth(year, monthIndex)));
  }
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
