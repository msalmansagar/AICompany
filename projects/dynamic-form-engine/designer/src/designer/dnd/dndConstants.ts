/**
 * Shared DnD constants — single source of truth for thresholds and sizing.
 * Centralising here prevents duplication between SectionContainer, tests,
 * and any future canvas component that renders variable-height lists.
 */

/** Field cards per section above which the field list is virtualised (ENT-010). */
export const VIRTUALIZATION_THRESHOLD = 40;

/**
 * Returns true when the field count exceeds the virtualisation threshold.
 * Extracted as a pure function so the decision can be unit-tested without a
 * rendered component.
 */
export function shouldVirtualizeFieldList(fieldCount: number): boolean {
  return fieldCount > VIRTUALIZATION_THRESHOLD;
}

/** Estimated height of one FieldSlot card in pixels, used by the virtual list estimateSize. */
export const ESTIMATED_FIELD_SLOT_HEIGHT_PX = 48;

/** Max-height of the scrollable section body when virtualisation is active. */
export const VIRTUALIZED_SECTION_MAX_HEIGHT_PX = 400;
