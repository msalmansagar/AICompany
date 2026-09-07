// Hidden grid columns used to be filtered out of the query by all three readers, so they
// never reached the published JSON and their values could not round-trip. They are now
// published carrying isVisible, and dropping them is the renderer's job — this is the one
// place that does it.

import { describe, it, expect } from 'vitest';
import type { GridColumnConfig } from '@qdb/shared';
import { visibleGridColumns } from './gridColumns';

function column(overrides: Partial<GridColumnConfig>): GridColumnConfig {
  return {
    columnId: 'col-1',
    displayOrder: 0,
    columnLabel: 'Column',
    targetAttribute: 'qdb_value',
    columnFieldType: 'text',
    ...overrides,
  };
}

describe('visibleGridColumns', () => {
  it('dropsColumns_whenIsVisibleIsFalse', () => {
    const columns = [
      column({ columnId: 'shown', isVisible: true }),
      column({ columnId: 'hidden', isVisible: false }),
    ];

    expect(visibleGridColumns(columns).map(c => c.columnId)).toEqual(['shown']);
  });

  // Forms published before the flag existed carry no isVisible at all. Treating absent as
  // hidden would blank every existing grid on the first deploy.
  it('keepsColumns_whenIsVisibleIsAbsent', () => {
    const columns = [column({ columnId: 'legacy' })];

    expect(visibleGridColumns(columns).map(c => c.columnId)).toEqual(['legacy']);
  });

  it('ordersByDisplayOrder', () => {
    const columns = [
      column({ columnId: 'third', displayOrder: 3 }),
      column({ columnId: 'first', displayOrder: 1 }),
      column({ columnId: 'second', displayOrder: 2 }),
    ];

    expect(visibleGridColumns(columns).map(c => c.columnId)).toEqual(['first', 'second', 'third']);
  });

  // The callers pass the config array straight off the form definition. Sorting it in place
  // would reorder the shared definition for every other consumer.
  it('doesNotMutateTheInputArray', () => {
    const columns = [
      column({ columnId: 'b', displayOrder: 2 }),
      column({ columnId: 'a', displayOrder: 1 }),
    ];

    visibleGridColumns(columns);

    expect(columns.map(c => c.columnId)).toEqual(['b', 'a']);
  });
});
