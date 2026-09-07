// The grid-level check only ever asked "is there at least one row". A row could therefore
// contain a blank required cell, an over-long value, or a malformed one, and still submit —
// the grid's own cell editor might flag it while the form let it through.
//
// gridCellValidation.test.ts covers the per-cell verdict; this covers the submit gate that
// consumes it.

import { describe, it, expect } from 'vitest';
import { ValidationEngine } from './ValidationEngine';
import type { FieldDefinition, GridColumnConfig } from '@qdb/shared';

const engine = new ValidationEngine();

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

function gridField(columnConfigs: GridColumnConfig[]): FieldDefinition {
  return {
    id: 'field-grid',
    sectionId: 'section-1',
    fieldType: 'interactive-grid',
    schemaName: 'entries',
    label: 'Entries',
    displayOrder: 1,
    columnSpan: 1,
    isRequired: false,
    isReadonly: false,
    isHidden: false,
    isVisible: true,
    validationRules: [],
    businessRules: [],
    gridConfig: {
      gridMode: 'entry',
      targetEntity: 'qdb_child',
      maxRows: 200,
      columnConfigs,
    },
  };
}

describe('ValidationEngine — grid column validation', () => {
  it('rejectsARow_withABlankRequiredCell', () => {
    const field = gridField([column({ isRequired: true })]);

    const errors = engine.validateField(field, [{ qdb_reference: '' }], {});

    expect(errors.length).toBeGreaterThan(0);
  });

  it('namesTheOffendingRow', () => {
    const field = gridField([column({ isRequired: true })]);

    const errors = engine.validateField(field, [{ qdb_reference: 'ok' }, { qdb_reference: '' }], {});

    expect(errors[0]).toContain('Row 2');
  });

  it('acceptsARow_thatSatisfiesEveryColumn', () => {
    const field = gridField([column({ isRequired: true, maxLength: 10 })]);

    const errors = engine.validateField(field, [{ qdb_reference: 'QA1234' }], {});

    expect(errors).toEqual([]);
  });

  it('rejectsAnOverLongCell', () => {
    const field = gridField([column({ maxLength: 3 })]);

    const errors = engine.validateField(field, [{ qdb_reference: 'abcdef' }], {});

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejectsAMalformedCell', () => {
    const field = gridField([column({ validationFormat: 'email' })]);

    const errors = engine.validateField(field, [{ qdb_reference: 'not-an-email' }], {});

    expect(errors.length).toBeGreaterThan(0);
  });

  // A selection grid stores record ids, which the column rules do not describe.
  it('leavesASelectionGridValueAlone', () => {
    const field = gridField([column({ isRequired: true })]);

    const errors = engine.validateField(field, ['record-id-1'], {});

    expect(errors).toEqual([]);
  });

  // The whole feature must be inert for grids published before it existed.
  it('addsNothing_whenNoColumnDeclaresARule', () => {
    const field = gridField([column()]);

    const errors = engine.validateField(field, [{ qdb_reference: '' }], {});

    expect(errors).toEqual([]);
  });

  it('addsNothing_whenTheGridHasNoColumnConfigs', () => {
    const field = gridField([]);

    const errors = engine.validateField(field, [{ anything: '' }], {});

    expect(errors).toEqual([]);
  });

  // An empty grid is the grid-level required rule's business, not a cell rule's.
  it('doesNotComplainAboutCells_inAnEmptyGrid', () => {
    const field = gridField([column({ isRequired: true })]);

    const errors = engine.validateField(field, [], {});

    expect(errors).toEqual([]);
  });
});
