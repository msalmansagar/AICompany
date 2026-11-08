import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

/**
 * Grid column ordering, kept to what qdb_display_order will accept.
 *
 * The column's minimum is 1. Numbering from an array index therefore sent the first column
 * as 0, which Dataverse refuses outright — "The value 0 of 'qdb_display_order' ... is
 * outside the valid range" — failing the whole save, so no grid column added in the designer
 * could be persisted.
 *
 * This lives beside the service rather than in the panel because it is a persistence rule,
 * not a presentation one, and it is applied again when writing: a column that entered the
 * store from some other path still reaches Dataverse correctly numbered.
 */
export function withSequentialDisplayOrder(
  columns: DesignerGridColumnConfig[],
): DesignerGridColumnConfig[] {
  return columns.map((column, index) => ({ ...column, displayOrder: index + 1 }));
}

/** The order a column appended to this list should take, continuing the 1-based sequence. */
export function nextDisplayOrder(columns: DesignerGridColumnConfig[]): number {
  return columns.length + 1;
}
