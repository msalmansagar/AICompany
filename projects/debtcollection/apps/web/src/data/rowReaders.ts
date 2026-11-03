import { FORMATTED_VALUE_ANNOTATION, LOOKUP_TABLE_ANNOTATION } from './schema.js';

/**
 * Reading a CRM row without inventing anything.
 *
 * Dataverse returns a typed value, and beside it an annotation carrying the platform's own display
 * text. These readers prefer the local label table where the option values are proven, fall back to
 * the platform's formatted value, and return `undefined` when neither answers — which renders as an
 * em dash. The alternative, showing the raw `100000604`, tells a user nothing; the worse alternative,
 * guessing a label, tells them something false.
 *
 * `undefined` rather than `null` throughout, so `exactOptionalPropertyTypes` keeps absent fields
 * genuinely absent rather than present-and-empty.
 */

export type CrmRow = Record<string, unknown>;

export function readText(row: CrmRow, column: string): string | undefined {
  const value = row[column];
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

export function readNumber(row: CrmRow, column: string): number | undefined {
  const value = row[column];
  return typeof value === 'number' ? value : undefined;
}

export function readBoolean(row: CrmRow, column: string): boolean | undefined {
  const value = row[column];
  return typeof value === 'boolean' ? value : undefined;
}

/** The platform's display text for a column, when it sent one. */
export function readFormatted(row: CrmRow, column: string): string | undefined {
  return readText(row, `${column}${FORMATTED_VALUE_ANNOTATION}`);
}

/**
 * A choice, as a label.
 *
 * The proven table wins because it is the same mapping the service layer filters by, so a list and
 * its filter always agree. The platform's formatted value is the fallback, and it is also the only
 * answer for the choices this build has not verified option values for.
 */
export function readChoice(
  row: CrmRow,
  column: string,
  labels?: Readonly<Record<number, string>>,
): string | undefined {
  const raw = row[column];
  if (typeof raw === 'number' && labels?.[raw] !== undefined) return labels[raw];
  return readFormatted(row, column);
}

/** Which table a polymorphic lookup points at — `contact` or `account` for the case customer. */
export function readLookupTable(row: CrmRow, column: string): string | undefined {
  return readText(row, `${column}${LOOKUP_TABLE_ANNOTATION}`);
}

/** A lookup's display name, which the platform supplies beside the id. */
export function readLookupName(row: CrmRow, column: string): string | undefined {
  return readFormatted(row, column);
}

/** Spreads a property only when it has a value, so absent stays absent. */
export function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}
