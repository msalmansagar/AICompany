/**
 * computeSnapshotPatches — DFE-ENH-001 E4
 *
 * Produces fine-grained immer patches (one per changed property) by mutating
 * the draft at the entity-property level rather than replacing entire record
 * maps at once. This ensures AuditPatchMapper receives paths like
 * /fields/loan_amount/isRequired rather than a single coarse /fields path.
 *
 * Used at the save boundary in DesignerScreen and in the E4 integration tests.
 * enablePatches() is called once at designerStore module init; callers do not
 * need to call it again.
 */

import { produceWithPatches } from 'immer';
import type { FormAuditableSnapshot } from '@/state/designerStore';

/**
 * Applies a delta between two record maps onto the immer draft so that the
 * resulting patches are one-per-changed-property rather than a coarse
 * top-level replace. Handles additions, removals, and property-level updates.
 */
function applyRecordMapDelta<T extends object>(
  draftMap: Record<string, T>,
  baselineMap: Record<string, T>,
  currentMap: Record<string, T>,
): void {
  for (const [id, entity] of Object.entries(currentMap)) {
    if (!baselineMap[id]) {
      // New entity: produces 'add' patch at /<map>/<id>
      draftMap[id] = entity;
    } else {
      // Existing entity: Object.assign on the draft proxy produces one
      // 'replace' patch per changed property, unchanged props are no-ops.
      Object.assign(draftMap[id], entity);
    }
  }

  for (const id of Object.keys(baselineMap)) {
    if (!currentMap[id]) {
      // Removed entity: produces 'remove' patch at /<map>/<id>
      delete draftMap[id];
    }
  }
}

/**
 * Computes immer patches between two FormAuditableSnapshot values using
 * fine-grained property-level mutations. Returns the standard
 * [nextState, patches, inversePatches] tuple from produceWithPatches.
 */
export function computeSnapshotPatches(
  baseline: FormAuditableSnapshot,
  current: FormAuditableSnapshot,
) {
  return produceWithPatches(baseline, (draft) => {
    applyRecordMapDelta(draft.fields, baseline.fields, current.fields);
    applyRecordMapDelta(draft.validationRules, baseline.validationRules, current.validationRules);
    applyRecordMapDelta(draft.businessRules, baseline.businessRules, current.businessRules);
  });
}
