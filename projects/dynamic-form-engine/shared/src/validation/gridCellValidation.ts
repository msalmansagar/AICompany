import type { GridColumnConfig, GridValidationFormat } from '../types/form.types.js';

/**
 * Per-column validation for grid cells.
 *
 * Grid columns previously had no validation at all — a maker could require the grid ("add at
 * least one row") but not require a value in a column. These rules live here rather than in
 * the cell editor so the editor and the submit gate reach the same verdict; a cell that shows
 * no error must not be able to block submit, and one that shows an error must.
 *
 * Every rule is off unless the column turns it on, so grids published before this validate
 * exactly as they did.
 */

/** Patterns behind each named format. 'custom' is absent — it defers to validationPattern. */
const GRID_FORMAT_PATTERNS: Record<Exclude<GridValidationFormat, 'none' | 'custom'>, RegExp> = {
  // Deliberately permissive: this rejects obvious typos, not exotic-but-valid addresses.
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // Digits with the punctuation phone numbers are actually written with.
  phone: /^\+?[\d\s()-]{6,}$/,
  url: /^https?:\/\/\S+$/i,
  numeric: /^-?\d+(\.\d+)?$/,
  alphanumeric: /^[A-Za-z0-9]+$/,
};

const FORMAT_FAILURE_MESSAGES: Record<Exclude<GridValidationFormat, 'none' | 'custom'>, string> = {
  email: 'Enter a valid email address',
  phone: 'Enter a valid phone number',
  url: 'Enter a valid URL starting with http:// or https://',
  numeric: 'Enter a number',
  alphanumeric: 'Use letters and numbers only',
};

/** True when the cell carries nothing a user would call a value. */
function isEmptyCell(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * The cell's value as text, for the rules that measure or match characters.
 * A lookup cell stores an object, so its display name is what those rules see.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && 'displayName' in value) {
    return String((value as { displayName: unknown }).displayName ?? '');
  }
  return '';
}

function requiredFailure(column: GridColumnConfig): string | null {
  return column.validationMessage || `${column.columnLabel} is required`;
}

function maxLengthFailure(column: GridColumnConfig, limit: number): string | null {
  return column.validationMessage || `${column.columnLabel} must be ${limit} characters or fewer`;
}

/** The regex a column's format resolves to, or null when it asks for no format check. */
function patternFor(column: GridColumnConfig): RegExp | null {
  const format = column.validationFormat;
  if (!format || format === 'none') return null;

  if (format === 'custom') {
    if (!column.validationPattern) return null;
    try {
      return new RegExp(column.validationPattern);
    } catch {
      // A malformed pattern is a configuration error, not a reason to reject the user's
      // input. Skipping it keeps a broken column usable rather than unfillable.
      return null;
    }
  }

  return GRID_FORMAT_PATTERNS[format] ?? null;
}

function formatFailure(column: GridColumnConfig): string {
  if (column.validationMessage) return column.validationMessage;
  const format = column.validationFormat;
  if (format && format !== 'none' && format !== 'custom') return FORMAT_FAILURE_MESSAGES[format];
  return `${column.columnLabel} is not in the expected format`;
}

/**
 * Validates one cell against its column's rules.
 *
 * @returns the message to show, or null when the cell passes.
 */
export function validateGridCell(column: GridColumnConfig, value: unknown): string | null {
  if (isEmptyCell(value)) {
    return column.isRequired ? requiredFailure(column) : null;
  }

  const text = asText(value);

  if (column.maxLength !== undefined && text.length > column.maxLength) {
    return maxLengthFailure(column, column.maxLength);
  }

  const pattern = patternFor(column);
  if (pattern && !pattern.test(text)) {
    return formatFailure(column);
  }

  return null;
}

/** One row's failures, keyed by the column attribute the message belongs to. */
export type GridRowErrors = Record<string, string>;

/**
 * Validates every cell in one row. Hidden columns are validated too — a hidden column can
 * still be required, and skipping it would let an unfillable row through.
 */
export function validateGridRow(
  columns: GridColumnConfig[],
  row: Record<string, unknown>,
): GridRowErrors {
  const errors: GridRowErrors = {};
  for (const column of columns) {
    const failure = validateGridCell(column, row[column.targetAttribute]);
    if (failure) errors[column.targetAttribute] = failure;
  }
  return errors;
}

/** True when no row in the grid has a failing cell. */
export function isGridValid(
  columns: GridColumnConfig[],
  rows: Array<Record<string, unknown>>,
): boolean {
  return rows.every(row => Object.keys(validateGridRow(columns, row)).length === 0);
}
