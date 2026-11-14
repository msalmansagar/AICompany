// DFE-AUTOSAVE-001: a save runs on a snapshot while the designer stays editable. When it
// finishes, only the changes that snapshot carried are settled; anything added or edited
// while it ran stays pending for the next save. Records are compared by reference: the
// store's immer updates replace a record object whenever it changes.
import type { DesignerState, FormAuditableSnapshot } from './designerStore';

/** The parts of the designer state a save was given, captured when it was scheduled. */
export type SavedSnapshot = Pick<
  DesignerState,
  | 'form'
  | 'tabs'
  | 'sections'
  | 'fields'
  | 'validationRules'
  | 'businessRules'
  | 'designPayload'
  | 'newIds'
  | 'dirtyIds'
  | 'deletedIds'
>;

/** Changes still waiting for a save once the finished save is settled; ids are not yet resolved. */
export interface PendingChanges {
  newIds: string[];
  dirtyIds: string[];
  deletedIds: string[];
  hasUnsavedFormOrDesign: boolean;
}

export const NO_PENDING_CHANGES: PendingChanges = {
  newIds: [],
  dirtyIds: [],
  deletedIds: [],
  hasUnsavedFormOrDesign: false,
};

type RecordSource = Pick<SavedSnapshot, 'form' | 'tabs' | 'sections' | 'fields' | 'validationRules' | 'businessRules'>;

function recordOf(source: RecordSource, id: string): unknown {
  if (source.form?.id === id) return source.form;
  return source.tabs[id] ?? source.sections[id] ?? source.fields[id]
    ?? source.validationRules[id] ?? source.businessRules[id];
}

function isChangedSince(current: RecordSource, saved: RecordSource, id: string): boolean {
  return recordOf(current, id) !== recordOf(saved, id);
}

/** Answers which changes in the current state the finished save did not write. */
export function findChangesMadeDuringSave(current: DesignerState, saved: SavedSnapshot): PendingChanges {
  const savedNewIds = new Set(saved.newIds);
  const savedDirtyIds = new Set(saved.dirtyIds);
  const savedDeletedIds = new Set(saved.deletedIds);
  return {
    newIds: current.newIds.filter(id => !savedNewIds.has(id)),
    dirtyIds: current.dirtyIds.filter(id => !savedDirtyIds.has(id) || isChangedSince(current, saved, id)),
    deletedIds: current.deletedIds.filter(id => !savedDeletedIds.has(id)),
    hasUnsavedFormOrDesign: current.form !== saved.form || current.designPayload !== saved.designPayload,
  };
}

/** Swaps temporary ids for the server-assigned ones the save returned. */
export function resolvePendingIds(ids: string[], resolvedIds: Record<string, string>): string[] {
  return ids.map(id => resolvedIds[id] ?? id);
}

/** The audit baseline after a save: what that save wrote, with real ids in place of temporary ones. */
export function auditSnapshotOfSave(
  saved: SavedSnapshot,
  resolvedIds: Record<string, string>,
): FormAuditableSnapshot {
  const fields = Object.fromEntries(
    Object.values(saved.fields).map(field => {
      const id = resolvedIds[field.id] ?? field.id;
      const sectionId = resolvedIds[field.sectionId] ?? field.sectionId;
      return [id, { ...field, id, sectionId }] as const;
    }),
  );
  return { fields, validationRules: { ...saved.validationRules }, businessRules: { ...saved.businessRules } };
}
