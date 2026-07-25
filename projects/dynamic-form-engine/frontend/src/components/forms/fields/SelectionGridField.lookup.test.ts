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

  it('resolves the FetchXml formatted-value form `attr@FormattedValue` (saved-view grids)', () => {
    // FetchXml results annotate lookups AND option-sets under the plain attribute
    // name, not the OData `_attr_value` form — must resolve to the name/label.
    const lookup = { parentcustomerid: SERVICE_REF_GUID, 'parentcustomerid@OData.Community.Display.V1.FormattedValue': 'Qatar National Bank' };
    expect(resolveRecordDisplayValue(lookup, 'parentcustomerid')).toBe('Qatar National Bank');

    const optionset = { gender: 1, 'gender@OData.Community.Display.V1.FormattedValue': 'Male' };
    expect(resolveRecordDisplayValue(optionset, 'gender')).toBe('Male');
  });

  it('returns an empty string for null, undefined, or missing values', () => {
    expect(resolveRecordDisplayValue({}, 'qdb_serviceref')).toBe('');
    expect(resolveRecordDisplayValue({ qdb_serviceref: null }, 'qdb_serviceref')).toBe('');
    expect(resolveRecordDisplayValue({ _qdb_serviceref_value: undefined }, 'qdb_serviceref')).toBe('');
  });
});
