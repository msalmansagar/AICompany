// qdb_display_order has a minimum of 1. The panel numbered columns from the array index, so
// the first column carried 0 and Dataverse rejected the create outright — "The value 0 of
// 'qdb_display_order' ... is outside the valid range. Minimum Value: 1" — failing the whole
// save. Every grid column added in the designer was unsaveable.

import { describe, it, expect } from 'vitest';
import { withSequentialDisplayOrder, nextDisplayOrder } from '@/services/gridColumnOrder';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';

function column(label: string, displayOrder = 0): DesignerGridColumnConfig {
  return {
    id: `col-${label}`, columnLabel: label, targetAttribute: 'qdb_x',
    columnFieldType: 'text', displayOrder, isVisible: true, isEditable: false,
    isRequired: false, maxLength: null, validationFormat: 'none',
    validationPattern: null, validationMessage: null, optionsJson: null,
    filterType: 'none', lookupTargetEntity: null, lookupDisplayAttribute: null,
    lookupValueAttribute: null,
  };
}

describe('grid column display order', () => {
  // The value Dataverse rejects is 0, so the very first column is the one that matters.
  it('numbersTheFirstColumnFromOne', () => {
    const [first] = withSequentialDisplayOrder([column('A')]);

    expect(first.displayOrder).toBe(1);
  });

  it('numbersTheRestSequentially', () => {
    const ordered = withSequentialDisplayOrder([column('A'), column('B'), column('C')]);

    expect(ordered.map(c => c.displayOrder)).toEqual([1, 2, 3]);
  });

  it('renumbersFromPositionNotFromThePreviousValue', () => {
    const ordered = withSequentialDisplayOrder([column('A', 9), column('B', 4)]);

    expect(ordered.map(c => c.displayOrder)).toEqual([1, 2]);
  });

  it('leavesEveryOtherPropertyAlone', () => {
    const [only] = withSequentialDisplayOrder([column('A')]);

    expect(only.columnLabel).toBe('A');
    expect(only.isVisible).toBe(true);
  });

  it('handlesAnEmptyList', () => {
    expect(withSequentialDisplayOrder([])).toEqual([]);
  });

  // A column appended to an existing list must continue the sequence, not restart it.
  it('givesTheFirstAddedColumnOrderOne', () => {
    expect(nextDisplayOrder([])).toBe(1);
  });

  it('appendsAfterTheExistingColumns', () => {
    expect(nextDisplayOrder([column('A'), column('B')])).toBe(3);
  });
});

// The panel is not the only way a column reaches the store, and a column that arrived
// already numbered 0 would fail the whole save. The write boundary renumbers regardless.
describe('GridColumnConfigService — ordering at the write boundary', () => {
  it('renumbersColumnsThatReachItNumberedFromZero', async () => {
    const created: Array<Record<string, unknown>> = [];
    const webApi = {
      retrieveMultipleRecords: async () => ({ entities: [] }),
      createRecord: async (_e: string, data: Record<string, unknown>) => {
        created.push(data);
        return { id: 'new-id' };
      },
      updateRecord: async () => ({}),
      deleteRecord: async () => ({}),
    } as unknown as ConstructorParameters<typeof GridColumnConfigService>[0];

    const service = new GridColumnConfigService(webApi);
    await service.syncColumns('3670e935-2da1-f111-b8dc-70a8a55bc6a5', [
      { ...column('A'), id: 'tmp_a', displayOrder: 0 },
      { ...column('B'), id: 'tmp_b', displayOrder: 1 },
    ]);

    expect(created.map(c => c['qdb_display_order'])).toEqual([1, 2]);
  });
});
