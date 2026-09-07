import type { GridColumnConfig } from '@qdb/shared';

/**
 * The columns a grid draws, in display order.
 *
 * Hidden columns are published rather than filtered out of the JSON, so every renderer has
 * to skip them itself. They still take part in row data and submission — a column can be
 * hidden precisely because it carries a key the child record needs but the user should not
 * see — so this is the only place that drops them.
 *
 * `isVisible` is absent on forms published before it existed; absent means visible.
 */
export function visibleGridColumns(columnConfigs: GridColumnConfig[]): GridColumnConfig[] {
  return columnConfigs
    .filter(column => column.isVisible !== false)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}
