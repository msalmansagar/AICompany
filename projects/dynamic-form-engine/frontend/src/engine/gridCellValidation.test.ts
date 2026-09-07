// Grid columns had no validation of any kind: a maker could require the grid ("add at least
// one row") but not require a value in a column, cap its length, or constrain its shape.
//
// The rules live in @qdb/shared because the cell editor and the submit gate must reach the
// same verdict — a cell that shows no error must not block submission, and one that shows an
// error must. These tests cover the shared verdict; ValidationEngine.grid.test.ts covers the
// gate that consumes it.

import { describe, it, expect } from 'vitest';
import type { GridColumnConfig } from '@qdb/shared';
import { validateGridCell, validateGridRow, isGridValid } from '@qdb/shared';

function column(overrides: Partial<GridColumnConfig> = {}): GridColumnConfig {
  return {
    columnId: 'col-1',
    displayOrder: 0,
    columnLabel: 'Reference',
    targetAttribute: 'qdb_reference',
    columnFieldType: 'text',
    ...overrides,
  };
}

describe('validateGridCell — required', () => {
  it('failsBlankCell_whenRequired', () => {
    expect(validateGridCell(column({ isRequired: true }), '')).toBe('Reference is required');
  });

  it('failsWhitespaceOnlyCell_whenRequired', () => {
    expect(validateGridCell(column({ isRequired: true }), '   ')).toBe('Reference is required');
  });

  it('failsMissingCell_whenRequired', () => {
    expect(validateGridCell(column({ isRequired: true }), undefined)).toBe('Reference is required');
  });

  it('passesBlankCell_whenNotRequired', () => {
    expect(validateGridCell(column(), '')).toBeNull();
  });

  // Every rule but required describes a value that IS there. Running them on a blank cell
  // would make an optional column impossible to leave empty.
  it('skipsFormatAndLength_onABlankOptionalCell', () => {
    const col = column({ maxLength: 3, validationFormat: 'email' });

    expect(validateGridCell(col, '')).toBeNull();
  });
});

describe('validateGridCell — max length', () => {
  it('failsWhenLonger', () => {
    expect(validateGridCell(column({ maxLength: 5 }), 'abcdef'))
      .toBe('Reference must be 5 characters or fewer');
  });

  it('passesAtExactlyTheLimit', () => {
    expect(validateGridCell(column({ maxLength: 5 }), 'abcde')).toBeNull();
  });

  it('measuresANumberByItsDigits', () => {
    expect(validateGridCell(column({ maxLength: 2 }), 1234)).not.toBeNull();
  });
});

describe('validateGridCell — format', () => {
  it.each([
    ['email', 'someone@example.com', 'not-an-email'],
    ['url', 'https://example.com', 'example.com'],
    ['numeric', '-12.5', '12a'],
    ['alphanumeric', 'AB12', 'AB 12'],
  ] as const)('%s accepts a valid value and rejects an invalid one', (format, valid, invalid) => {
    const col = column({ validationFormat: format });

    expect(validateGridCell(col, valid)).toBeNull();
    expect(validateGridCell(col, invalid)).not.toBeNull();
  });

  it('customFormat_appliesTheColumnPattern', () => {
    const col = column({ validationFormat: 'custom', validationPattern: '^[A-Z]{2}[0-9]{4}$' });

    expect(validateGridCell(col, 'QA1234')).toBeNull();
    expect(validateGridCell(col, 'qa1234')).not.toBeNull();
  });

  it('customFormat_withNoPattern_checksNothing', () => {
    expect(validateGridCell(column({ validationFormat: 'custom' }), 'anything')).toBeNull();
  });

  // A pattern that will not compile is a configuration mistake. Rejecting every value would
  // leave the column unfillable, which punishes the user for the maker's typo.
  it('customFormat_withAMalformedPattern_checksNothing', () => {
    const col = column({ validationFormat: 'custom', validationPattern: '([unclosed' });

    expect(validateGridCell(col, 'anything')).toBeNull();
  });

  it('noneFormat_checksNothing', () => {
    expect(validateGridCell(column({ validationFormat: 'none' }), 'not-an-email')).toBeNull();
  });

  // A lookup cell stores { id, displayName }; the rules that match characters see the name.
  it('matchesALookupCellByItsDisplayName', () => {
    const col = column({ validationFormat: 'alphanumeric' });

    expect(validateGridCell(col, { id: 'x', displayName: 'AB12' })).toBeNull();
    expect(validateGridCell(col, { id: 'x', displayName: 'A B' })).not.toBeNull();
  });
});

describe('validateGridCell — messages', () => {
  it('prefersTheColumnMessage_overTheGeneratedOne', () => {
    const col = column({ isRequired: true, validationMessage: 'We need your CR number' });

    expect(validateGridCell(col, '')).toBe('We need your CR number');
  });
});

describe('validateGridRow and isGridValid', () => {
  const columns = [
    column({ columnId: 'a', targetAttribute: 'qdb_a', columnLabel: 'A', isRequired: true }),
    column({ columnId: 'b', targetAttribute: 'qdb_b', columnLabel: 'B', maxLength: 2 }),
  ];

  it('keysFailuresByTheColumnAttribute', () => {
    const errors = validateGridRow(columns, { qdb_a: '', qdb_b: 'xyz' });

    expect(Object.keys(errors).sort()).toEqual(['qdb_a', 'qdb_b']);
  });

  it('reportsNothingForAValidRow', () => {
    expect(validateGridRow(columns, { qdb_a: 'ok', qdb_b: 'xy' })).toEqual({});
  });

  it('isGridValid_isFalse_whenAnyRowFails', () => {
    const rows = [{ qdb_a: 'ok', qdb_b: 'xy' }, { qdb_a: '', qdb_b: 'xy' }];

    expect(isGridValid(columns, rows)).toBe(false);
  });

  it('isGridValid_isTrue_forAnEmptyGrid', () => {
    expect(isGridValid(columns, [])).toBe(true);
  });

  // A column can be hidden precisely because it carries a key the user must not see. Skipping
  // hidden columns would let a row through that the child record cannot accept.
  it('validatesHiddenColumnsToo', () => {
    const hidden = [column({ targetAttribute: 'qdb_key', isVisible: false, isRequired: true })];

    expect(isGridValid(hidden, [{ qdb_key: '' }])).toBe(false);
  });

  // Grids published before column validation existed carry none of these properties.
  it('passesEverything_whenNoColumnDeclaresARule', () => {
    const legacy = [column({ targetAttribute: 'qdb_free' })];

    expect(isGridValid(legacy, [{ qdb_free: '' }, { qdb_free: 'x'.repeat(5000) }])).toBe(true);
  });
});
