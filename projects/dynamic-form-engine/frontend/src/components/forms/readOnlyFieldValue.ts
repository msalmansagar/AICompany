// DFE-FBE-001 (Wave 2, minimal) — resolve a source field + format its value read-only.
// Type-aware for the simple field types (text/number/date/choice/boolean). File and grid
// types return a lightweight placeholder pending the full C-001 read-only renderer.
import type { FormDefinition, FieldDefinition } from '@qdb/shared';

/** Finds a field anywhere in the form by its schema name (the value key). */
export function findFieldBySchema(
  formDefinition: FormDefinition | null,
  schemaName: string,
): FieldDefinition | undefined {
  if (!formDefinition) return undefined;
  for (const tab of formDefinition.tabs) {
    for (const section of tab.sections) {
      const match = section.fields.find((f) => f.schemaName === schemaName);
      if (match) return match;
    }
  }
  return undefined;
}

/** Formats a field's current value for read-only display (label for choices, etc.). */
export function formatReadOnlyValue(field: FieldDefinition | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (!field) return String(value);

  switch (field.fieldType) {
    case 'dropdown':
    case 'radio': {
      const opt = field.options?.find((o) => o.value === String(value));
      return opt?.label ?? String(value);
    }
    case 'multiselect': {
      const values = Array.isArray(value) ? value : [value];
      return values
        .map((v) => field.options?.find((o) => o.value === String(v))?.label ?? String(v))
        .join(', ');
    }
    case 'checkbox':
    case 'boolean':
      return value ? (field.trueLabel ?? 'Yes') : (field.falseLabel ?? 'No');
    case 'lookup': {
      const v = value as { displayName?: string };
      return v?.displayName ?? String(value);
    }
    case 'multiLookup': {
      const arr = Array.isArray(value) ? (value as { displayName?: string }[]) : [];
      return arr.map((v) => v?.displayName ?? '').filter(Boolean).join(', ');
    }
    case 'file': {
      const files = Array.isArray(value) ? value : [];
      return files.length > 0 ? `${files.length} file(s) uploaded` : '';
    }
    case 'repeatingGrid':
    case 'interactive-grid': {
      const rows = Array.isArray(value) ? value.length : 0;
      return rows > 0 ? `${rows} row(s)` : '';
    }
    default:
      return String(value);
  }
}
