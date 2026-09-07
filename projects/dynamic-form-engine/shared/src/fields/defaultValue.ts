/**
 * Field default values — one codec shared by the designer, the designer preview and
 * the runtime, so a default authored in one place cannot be read differently in another.
 *
 * `qdb_default_value` is a single text column, so a multi-select default is stored as a
 * JSON array. Comma-separated text is still accepted on read because defaults authored
 * before the picker existed were typed by hand.
 */

/** Field types whose value is a list of option values rather than a single one. */
const MULTI_VALUE_FIELD_TYPES = new Set<string>(['multiselect', 'multi_select']);

/** Field types whose value is a boolean rather than text. */
const BOOLEAN_FIELD_TYPES = new Set<string>(['checkbox', 'boolean']);

const TRUE_LITERALS = new Set(['true', '1', 'yes', 'y']);
const FALSE_LITERALS = new Set(['false', '0', 'no', 'n']);

/** True when the field type stores its default as a list of option values. */
export function isMultiValueFieldType(fieldType: string): boolean {
  return MULTI_VALUE_FIELD_TYPES.has(fieldType);
}

/** True when the field type stores its default as a boolean. */
export function isBooleanFieldType(fieldType: string): boolean {
  return BOOLEAN_FIELD_TYPES.has(fieldType);
}

/** The stored form of a multi-select default, or null when nothing is selected. */
export function serialiseMultiSelectDefault(values: readonly string[]): string | null {
  const selected = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return selected.length > 0 ? JSON.stringify(selected) : null;
}

/** The option values a multi-select default names, in author order. */
export function parseMultiSelectDefault(raw: unknown): string[] {
  if (Array.isArray(raw)) return cleanValues(raw);
  if (typeof raw !== 'string') return [];

  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  const fromJson = parseJsonArray(trimmed);
  return cleanValues(fromJson ?? trimmed.split(','));
}

/**
 * The initial runtime value for a field, coerced to the shape its control expects.
 * Returns null when the field has no usable default.
 */
export function resolveFieldDefaultValue(field: {
  fieldType: string;
  defaultValue?: unknown;
}): unknown {
  const raw = field.defaultValue;
  if (raw === undefined || raw === null || raw === '') return null;
  if (isMultiValueFieldType(field.fieldType)) {
    const values = parseMultiSelectDefault(raw);
    return values.length > 0 ? values : null;
  }
  if (isBooleanFieldType(field.fieldType)) return parseBooleanDefault(raw);
  return raw;
}

/** A stored boolean default as a boolean, or null when the text names neither state. */
export function parseBooleanDefault(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  const text = String(raw).trim().toLowerCase();
  if (TRUE_LITERALS.has(text)) return true;
  if (FALSE_LITERALS.has(text)) return false;
  return null;
}

function parseJsonArray(raw: string): unknown[] | null {
  if (!raw.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanValues(values: readonly unknown[]): string[] {
  return values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}
