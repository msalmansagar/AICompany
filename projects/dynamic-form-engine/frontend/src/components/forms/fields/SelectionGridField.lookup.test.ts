import { describe, it, expect } from 'vitest';
import { resolveRecordDisplayValue } from './SelectionGridField';

const SERVICE_REF_GUID = '11111111-2222-3333-4444-555555555555';
const FORMATTED_KEY = '_qdb_serviceref_value@OData.Community.Display.V1.FormattedValue';

describe('resolveRecordDisplayValue', () => {
  it('returns the direct schema-name value for a non-lookup field', () => {
    const values = { qdb_name: 'Alice', qdb_amount: 42 };

    expect(resolveRecordDisplayValue(values, 'qdb_name')).toBe('Alice');
    expect(resolveRecordDisplayValue(values, 'qdb_amount')).toBe('42');
  });

  it('resolves a lookup via the _{schema}_value key when only the GUID is present', () => {
    const values = { _qdb_serviceref_value: SERVICE_REF_GUID };

    expect(resolveRecordDisplayValue(values, 'qdb_serviceref')).toBe(SERVICE_REF_GUID);
  });

  it('prefers the formatted-value annotation (friendly name, not GUID)', () => {
    const values = {
      _qdb_serviceref_value: SERVICE_REF_GUID,
      [FORMATTED_KEY]: 'Service A',
    };

    expect(resolveRecordDisplayValue(values, 'qdb_serviceref')).toBe('Service A');
  });

  it('returns an empty string for null, undefined, or missing values', () => {
    expect(resolveRecordDisplayValue({}, 'qdb_serviceref')).toBe('');
    expect(resolveRecordDisplayValue({ qdb_serviceref: null }, 'qdb_serviceref')).toBe('');
    expect(resolveRecordDisplayValue({ _qdb_serviceref_value: undefined }, 'qdb_serviceref')).toBe('');
  });
});
